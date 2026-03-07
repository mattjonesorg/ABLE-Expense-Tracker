# ABLE Tracker -- Security Audit Report

**Audit date:** 2026-03-07
**Auditor:** Security Reviewer (AI Agent)
**Scope:** Full codebase audit covering `api/`, `infra/`, `web/src/lib/`
**Issue:** [#19 -- Security audit and hardening](https://github.com/mattjonesorg/ABLE-Expense-Tracker/issues/19)

---

## Executive Summary

The ABLE Tracker application demonstrates a strong security posture with defense-in-depth authentication, proper input validation, strict IAM policies, and thoughtful PII protection. This audit identified 0 CRITICAL findings, 0 HIGH findings (all fixed in this PR), 2 MEDIUM recommendations for future work, and several LOW/INFO observations.

This application handles financial data and disability-related information for vulnerable individuals. The security measures in place are appropriate for the sensitivity of this data.

---

## Architecture Security Overview

```
Browser  -->  CloudFront (HTTPS)  -->  S3 (static PWA assets)
                                       |
Browser  -->  API Gateway (HTTPS)  -->  Lambda handlers
                  |                        |
           JWT Authorizer             DynamoDB (single-table)
           (Cognito)                  S3 (receipt storage)
                                      Claude API (categorization)
```

**Authentication flow:**
1. User authenticates via Cognito `USER_PASSWORD_AUTH` flow
2. Frontend stores tokens in `sessionStorage` (cleared on tab close)
3. API requests include Cognito ID token as `Bearer` token
4. API Gateway JWT authorizer validates token (primary check)
5. Lambda `extractAuthContext()` re-validates claims (defense-in-depth)

---

## Findings

### FIXED IN THIS PR

#### F-01: Categorize endpoint missing input length limits (MEDIUM -- fixed)

**File:** `api/src/handlers/categorize/categorize.ts`
**Description:** The `/expenses/categorize` endpoint accepted vendor and description fields without length limits. An attacker could send extremely long strings to waste Claude API tokens or cause excessive processing.
**Fix:** Added `MAX_VENDOR_LENGTH = 200` and `MAX_DESCRIPTION_LENGTH = 1000`, consistent with the create expense handler. Tests added in `api/test/handlers/categorize/categorize.test.ts`.

#### F-02: Create expense handler missing categoryNotes length limit (LOW -- fixed)

**File:** `api/src/handlers/expenses/create.ts`
**Description:** The `categoryNotes` field in the create expense handler had no length limit, unlike all other string fields which were properly bounded.
**Fix:** Added `MAX_CATEGORY_NOTES_LENGTH = 1000`. Tests added in `api/test/handlers/expenses/create.test.ts`.

#### F-03: S3 IAM permissions not scoped to receipts/ prefix (MEDIUM -- fixed)

**File:** `infra/lib/api-stack.ts`
**Description:** The upload handler Lambda was granted `s3:ReadWrite` on the entire receipt bucket via `bucket.grantReadWrite(fn)`. If the Lambda were compromised, it could access or overwrite any object in the bucket, not just receipts.
**Fix:** Changed to `bucket.grantReadWrite(fn, 'receipts/*')` to scope IAM permissions to only the `receipts/` prefix. CDK assertion test added in `infra/test/api-stack.test.ts`.

#### F-04: Stub handler lacked defense-in-depth auth check (LOW -- fixed)

**File:** `api/src/handlers/stub.handler.ts`
**Description:** The dashboard reimbursements stub handler returned `501 Not Implemented` without checking auth context. While the API Gateway JWT authorizer provides primary protection, all other handlers include a Lambda-level auth check as defense-in-depth.
**Fix:** Added `extractAuthContext(event)` call to the stub handler, consistent with all other endpoints.

### RECOMMENDATIONS FOR FUTURE WORK

#### R-01: Anthropic API key passed as plaintext environment variable (MEDIUM)

**File:** `infra/lib/api-stack.ts` (line 185-195)
**Description:** The Anthropic API key is read from CDK context (`tryGetContext('anthropicApiKey')`) and set as a plaintext Lambda environment variable. While AWS encrypts Lambda environment variables at rest with KMS, the key is visible in the CloudFormation template, Lambda console, and CloudTrail logs.
**Current mitigation:** The `.env.deploy.example` documents using Secrets Manager, and `cdk.context.json` is in `.gitignore`.
**Recommendation:** Migrate to AWS Secrets Manager:
1. Store the key in Secrets Manager (already documented in `.env.deploy.example`)
2. Grant the categorize Lambda `secretsmanager:GetSecretValue` permission
3. Read the key at Lambda cold start via the Secrets Manager SDK
4. Remove the CDK context-based approach

This should be tracked as a separate issue.

#### R-02: No request body size limit at API Gateway level (LOW)

**Description:** API Gateway HTTP APIs do not have a configurable maximum request body size (the default is 10 MB). Individual handlers validate field lengths, but a defense-in-depth approach would also enforce limits at the gateway level.
**Current mitigation:** All handlers validate individual field lengths. The categorize endpoint now has vendor (200 chars) and description (1000 chars) limits. The upload handler validates fileSize. API Gateway throttling is configured.
**Recommendation:** Monitor for abuse. If needed, consider adding a Lambda@Edge function or WAF rule to enforce body size limits.

---

## Audit Details by Area

### 1. Authentication

**Status: PASS**

| Check | Result | Evidence |
|-------|--------|----------|
| JWT validation at API Gateway | PASS | `HttpUserPoolAuthorizer` in `api-stack.ts` with `defaultAuthorizer` |
| Defense-in-depth Lambda auth | PASS | All handlers call `extractAuthContext()` |
| Required claims validated | PASS | `sub`, `email`, `custom:accountId`, `custom:role` checked in `auth.ts` |
| Role claim validated | PASS | Checked against `VALID_ROLES` set (`owner`, `authorized_rep`) |
| Token expiry enforced | PASS | API Gateway JWT authorizer checks `exp` claim; frontend checks with 60s buffer |
| Audience validated | PASS | `HttpUserPoolAuthorizer` configured with `userPoolClients: [userPoolClient]` |
| Generic error messages | PASS | All auth failures return generic "Unauthorized" or "Forbidden" per #43 |
| Self-signup disabled | PASS | `selfSignUpEnabled: false` in `auth-stack.ts` |
| Strong password policy | PASS | Min 8 chars, requires uppercase, lowercase, digits, symbols |
| Session storage | PASS | Tokens stored in `sessionStorage` (cleared on tab close), not `localStorage` |

### 2. Authorization

**Status: PASS**

| Check | Result | Evidence |
|-------|--------|----------|
| All endpoints require auth | PASS | Every handler calls `authenticate`/`extractAuthContext` before processing |
| Data scoped by accountId | PASS | All DynamoDB queries use `ACCOUNT#${accountId}` partition key from JWT |
| No cross-account access | PASS | `accountId` derived from JWT claims, never from request body |
| Receipt key scoping | PASS | `create.ts` validates `receipts/${context.accountId}/` prefix + `..` check |
| IDOR prevention | PASS | `getExpense`, `markReimbursed` both scope by accountId from JWT |

### 3. IAM Least Privilege

**Status: PASS (after fix F-03)**

| Check | Result | Evidence |
|-------|--------|----------|
| Per-handler DynamoDB access | PASS | read/write vs read-only vs none per route definition |
| DynamoDB scoped to table ARN | PASS | CDK `table.grantReadData/grantReadWriteData` scopes to table + index ARNs |
| S3 scoped to prefix | PASS (fixed) | Changed to `bucket.grantReadWrite(fn, 'receipts/*')` |
| No wildcard IAM resources | PASS | All grants use specific table/bucket ARNs |
| CDK assertion tests | PASS | 14 IAM tests in `infra/test/api-stack.test.ts` |

### 4. Input Validation

**Status: PASS (after fixes F-01, F-02)**

| Endpoint | Field | Validation | Limit |
|----------|-------|-----------|-------|
| POST /expenses | vendor | required, string | 200 chars |
| POST /expenses | description | string | 1000 chars |
| POST /expenses | amount | required, positive integer | 10,000,000 cents ($100,000) |
| POST /expenses | date | required, YYYY-MM-DD, not future | -- |
| POST /expenses | category | valid ABLE category enum | 100 chars |
| POST /expenses | categoryNotes | string | 1000 chars (fixed) |
| POST /expenses | paidBy | string | 100 chars |
| POST /expenses | receiptKey | account-scoped, no `..` | 500 chars |
| POST /expenses/categorize | vendor | required, string | 200 chars (fixed) |
| POST /expenses/categorize | description | required, string | 1000 chars (fixed) |
| POST /expenses/categorize | amount | non-negative integer | 10,000,000 cents |
| PUT /expenses/{id}/reimburse | reimbursedBy | required, string | 200 chars |
| POST /uploads/request-url | contentType | required, whitelist | 3 types only |
| POST /uploads/request-url | fileSize | required, positive integer | 10 MB |
| GET /expenses | category | valid ABLE category | enum check |
| GET /expenses | startDate, endDate | YYYY-MM-DD format | regex check |
| GET /expenses | limit | positive integer | -- |
| GET /expenses | reimbursed | "true" or "false" | -- |

### 5. PII Protection

**Status: PASS**

| Check | Result | Evidence |
|-------|--------|----------|
| Claude prompt contains no PII | PASS | `buildUserPrompt()` sends only vendor, description, amount |
| No user IDs in Claude prompt | PASS | `CategorizationInput` interface has only 3 fields |
| No email in Claude prompt | PASS | Email not part of `CategorizationInput` |
| System prompt is static | PASS | No dynamic user data in `SYSTEM_PROMPT` |
| Graceful error handling | PASS | Claude API errors return `null`, no error details to client |

### 6. S3 Security

**Status: PASS**

| Check | Result | Evidence |
|-------|--------|----------|
| Block all public access | PASS | `BlockPublicAccess.BLOCK_ALL` in `data-stack.ts` |
| Enforce SSL | PASS | `enforceSSL: true` in `data-stack.ts` |
| Server-side encryption | PASS | `BucketEncryption.S3_MANAGED` in `data-stack.ts` |
| Versioning enabled | PASS | `versioned: true` in `data-stack.ts` |
| Presigned URL TTL | PASS | 900 seconds (15 minutes) in `request-url.ts` |
| Content type whitelist | PASS | Only `image/jpeg`, `image/png`, `image/webp` allowed |
| File size limit | PASS | 10 MB max, enforced at handler + S3 `ContentLength` |
| Account-scoped keys | PASS | `receipts/${accountId}/${ulid}.${ext}` format |
| ULID for filenames | PASS | Prevents predictable/guessable file paths |

### 7. CORS

**Status: PASS**

| Check | Result | Evidence |
|-------|--------|----------|
| No wildcard origins | PASS | Tested in `api-stack.test.ts` |
| Explicit origin list | PASS | Props + CDK context configuration |
| Specific methods | PASS | GET, POST, PUT, DELETE, OPTIONS only |
| Specific headers | PASS | Content-Type, Authorization only |
| CDK assertion tests | PASS | 6 CORS tests in `api-stack.test.ts` |

### 8. Error Handling

**Status: PASS**

| Check | Result | Evidence |
|-------|--------|----------|
| No stack traces in responses | PASS | All errors use `errorResponse()` helpers with codes |
| Generic auth errors | PASS | "Unauthorized" / "Forbidden" only, no claim details |
| Claude API error handling | PASS | Returns `null` on any error (graceful degradation) |
| JSON parse errors | PASS | Generic "Request body must be valid JSON" message |
| Client-side error handling | PASS | `ApiServerError` shows generic message, logs details to console only |

### 9. Secret Management

**Status: PASS (with R-01 recommendation)**

| Check | Result | Evidence |
|-------|--------|----------|
| No hardcoded secrets | PASS | Grep found no API keys, passwords, or credentials in source |
| .gitignore covers secrets | PASS | `.env*`, `credentials.json`, `*.pem`, `*.key`, `cdk.context.json` |
| PreToolUse hook | PASS | Secret scanning hook in `.claude/settings.json` for Write/Edit |
| SubagentStop review hook | PASS | Security review hook runs on every agent completion |
| Config from env vars | PASS | Web config reads `VITE_*` env vars, API reads `process.env` |
| Cognito config not hardcoded | PASS | `config.ts` uses `requireEnv()` with clear error messages |

### 10. API Gateway Throttling

**Status: PASS**

| Check | Result | Evidence |
|-------|--------|----------|
| Default throttling | PASS | 100 req/s rate, 200 burst limit |
| Categorize throttling | PASS | 10 req/s rate, 20 burst (stricter for AI endpoint) |
| CDK assertion tests | PASS | 4 throttling tests in `api-stack.test.ts` |

### 11. Frontend Security

**Status: PASS**

| Check | Result | Evidence |
|-------|--------|----------|
| Token expiry check | PASS | `isTokenExpired()` with 60s buffer in `cognito.ts` |
| Session-scoped storage | PASS | `sessionStorage` clears on tab close |
| Auth context provider | PASS | `AuthProvider` validates tokens on mount |
| 401 handling | PASS | `ApiAuthenticationError` prompts re-login |
| No PII in client requests | PASS | API client sends only expense data fields |

---

## Security Checklist Status

Based on the `.claude/agents/security-reviewer.md` checklist:

### Authentication & Authorization
- [x] All API endpoints require valid Cognito JWT (except no public health check exists)
- [x] JWT verification checks expiration, issuer, and audience
- [x] Users can only access data for their own account (partition key scoping)
- [x] No endpoint allows unauthenticated access to expense data

### Data Protection
- [x] All money values are integers (no floating point manipulation attacks)
- [x] S3 presigned URLs have short TTL (15 minutes)
- [x] S3 bucket blocks all public access
- [x] No ABLE account numbers, SSNs, or beneficiary health info stored
- [x] Receipt images accessible only via presigned URLs, not direct S3 paths

### Claude API / External Calls
- [x] Only expense description, vendor name, and amount sent to Claude
- [x] No user names, emails, or identifiers in Claude prompts
- [ ] Claude API key stored in Secrets Manager, never in code or env vars (see R-01)
- [x] Claude API failures don't leak error details to the client

### Infrastructure
- [x] Lambda roles scoped to minimum required DynamoDB operations
- [x] Lambda roles scoped to specific S3 bucket and key prefix (fixed in F-03)
- [x] API Gateway uses HTTPS only
- [x] CloudFront serves over HTTPS with modern TLS (`ViewerProtocolPolicy.REDIRECT_TO_HTTPS`)
- [x] No wildcards in IAM policy resources

### Input Validation
- [x] All Lambda handlers validate input before processing
- [x] Expense amounts validated as positive integers
- [x] Dates validated and bounded (no future dates)
- [x] String inputs bounded in length (fixed in F-01, F-02)
- [x] File upload types restricted (images only for receipts)

---

## Changes Made in This PR

| File | Change | Finding |
|------|--------|---------|
| `api/src/handlers/categorize/categorize.ts` | Added vendor (200) and description (1000) length limits | F-01 |
| `api/src/handlers/expenses/create.ts` | Added categoryNotes (1000) length limit | F-02 |
| `infra/lib/api-stack.ts` | Scoped S3 grant to `receipts/*` prefix | F-03 |
| `api/src/handlers/stub.handler.ts` | Added `extractAuthContext` defense-in-depth | F-04 |
| `api/test/handlers/categorize/categorize.test.ts` | 4 tests for vendor/description length limits | F-01 |
| `api/test/handlers/expenses/create.test.ts` | 2 tests for categoryNotes length limit | F-02 |
| `infra/test/api-stack.test.ts` | 1 test for S3 prefix scoping | F-03 |
| `docs/SECURITY.md` | This document | -- |
