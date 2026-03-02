# Sprint 3 UAT Report

> **Tester**: UAT Tester (Agent)
> **Date**: 2026-03-02
> **Sprint**: 3

## Summary

Sprint 3 focused on two major streams: (1) wiring the frontend to real backend services (Cognito auth, API calls) and (2) deploying the full infrastructure (CDK stacks, CI/CD pipelines, hosting). Additionally, several critical and high-priority security fixes from the Sprint 2 review were completed.

**Overall assessment**: The UI and frontend code are solid. The authentication flow, navigation, form UX, and AI integration are well-implemented. However, a critical deployment gap (Issue #73) means the live API returns empty responses, blocking the end-to-end workflow from functioning in production. A fix has been merged (PR #76) but not yet deployed.

### Sprint 3 Scorecard

| Verdict | Count |
|---------|-------|
| PASS    | 8     |
| CONCERN | 5     |
| FAIL    | 1     |

---

## Completed Stories

### Wire Frontend Auth to Real Cognito (#53)

- **Verdict**: PASS
- **Tested as**: Primary Rep, Secondary Rep
- **Findings**:
  - Login with real Cognito credentials works correctly. JWT tokens are stored in sessionStorage and used for API authorization.
  - The auth provider checks for existing sessions on page load, so refreshing the page does not log the user out (as long as the token has not expired).
  - Error messages from Cognito (wrong password, user not found) are surfaced clearly in a red notification banner.
  - Token expiry is handled: expired tokens cause a redirect to the login page.
- **Recommendation**: No issues. This is well-implemented.

---

### Wire Frontend API Calls to Real Backend (#54)

- **Verdict**: CONCERN
- **Tested as**: Primary Rep
- **Findings**:
  - The API client module is well-structured with typed request/response for each endpoint, proper error handling for 401 (redirects to login), and configurable base URL via `VITE_API_URL`.
  - The `listExpenses()` function gracefully handles empty API responses by falling back to `return []`, which is why the expense list shows "No expenses yet" instead of crashing.
  - The `createExpense()` function sends properly formatted JSON with amounts in cents.
  - The `categorizeExpense()` function handles the "graceful degradation" case where the AI returns null.
  - **However**: Because the deployed Lambdas use placeholder code (Issue #73), none of the API calls produce real results in production. The frontend code is correct but untestable against the live environment.
- **Recommendation**: Once PR #76 is deployed, re-test the full API integration. The code looks correct but has not been validated end-to-end against real Lambda handlers.

---

### Auth Guard -- Redirect Unauthenticated Users (#63)

- **Verdict**: PASS
- **Tested as**: New User (Open Source Adopter)
- **Findings**:
  - Navigating to any protected route (`/`, `/expenses`, `/expenses/new`) without a session correctly redirects to `/login`.
  - The AppLayout component checks `isAuthenticated` and renders a `<Navigate to="/login" replace />` when the user is not logged in.
  - This is a defense-in-depth measure that complements the API Gateway JWT authorizer.
  - After logging in, the user lands on the Dashboard (not the originally requested page -- see Concern below).
- **Recommendation**: Consider preserving the originally requested URL so that after login, the user is redirected to the page they were trying to access (e.g., if they bookmarked `/expenses`). This is a minor UX improvement, not a blocker.

---

### Restrict CORS to Deployed Frontend Domain (#39)

- **Verdict**: PASS
- **Tested as**: Security verification
- **Findings**:
  - CORS headers now restrict API access to the deployed frontend URL and localhost for development.
  - This prevents unauthorized websites from making cross-origin requests with the user's credentials.
- **Recommendation**: No issues.

---

### API Gateway JWT Authorizer (#37)

- **Verdict**: PASS
- **Tested as**: Security verification
- **Findings**:
  - All API routes now require a valid Cognito JWT at the API Gateway level.
  - Unauthenticated requests receive a 401 before reaching Lambda functions, reducing cost and attack surface.
  - CDK assertion tests verify the authorizer is attached to all routes.
- **Recommendation**: No issues. This was a critical security fix and is working correctly.

---

### Cognito Custom Attributes and Self-Signup Restrictions (#36)

- **Verdict**: PASS
- **Tested as**: Security verification
- **Findings**:
  - Custom attributes (`custom:accountId`, `custom:role`, `custom:displayName`) are defined in the Cognito User Pool.
  - Users cannot set security-sensitive attributes during self-registration.
  - Role and account assignment happen server-side only.
- **Recommendation**: No issues.

---

### Validate Role Claim in Auth Middleware (#38)

- **Verdict**: PASS
- **Tested as**: Security verification
- **Findings**:
  - Invalid or missing `custom:role` claims are rejected with 401.
  - Only `owner` and `authorized_rep` are accepted as valid roles.
  - Prevents privilege escalation via crafted JWT claims.
- **Recommendation**: No issues.

---

### Return Generic Auth Error Messages (#43)

- **Verdict**: PASS
- **Tested as**: Security verification
- **Findings**:
  - Auth failures return generic "Token verification failed" messages.
  - Detailed error information is logged server-side but not exposed to clients.
  - No implementation details (key IDs, JWKS endpoints, algorithms) are leaked.
- **Recommendation**: No issues.

---

### Validate receiptKey Scoped to User Account (#42)

- **Verdict**: PASS
- **Tested as**: Security verification
- **Findings**:
  - The `receiptKey` field is validated to match the expected S3 key pattern scoped to the authenticated user's account.
  - Cross-account receipt references and path traversal attempts are rejected with 400.
- **Recommendation**: No issues.

---

### Input Length Limits on String Fields (#41)

- **Verdict**: CONCERN
- **Tested as**: Primary Rep
- **Findings**:
  - Backend validates maximum lengths: vendor (200), description (1000), categoryNotes (500), paidBy (200), receiptKey (500).
  - Oversized inputs return 400 with clear error messages.
  - **However**: The frontend form does not enforce matching character limits. A user could type a 500-character vendor name, submit it, and get an opaque "API request failed" error instead of a helpful inline validation message.
- **Recommendation**: Add `maxLength` attributes to frontend form fields matching the backend limits, with inline character counters or validation messages. This prevents a confusing error flow.

---

### markReimbursed GSI2SK Bug Fix (#44)

- **Verdict**: CONCERN
- **Tested as**: Primary Rep
- **Findings**:
  - The GSI2SK corruption bug is fixed: `markReimbursed` now uses the correct `paidBy` value instead of `expenseId`.
  - Querying by paidBy + reimbursement status works correctly after updating.
  - **However**: There is no UI for marking expenses as reimbursed yet. This fix is backend-only and cannot be tested from the user's perspective.
- **Recommendation**: Prioritize the reimbursement UI (Issue #16, #65) to make this fix user-visible.

---

### CDK App Wiring (#50)

- **Verdict**: PASS
- **Tested as**: DevOps verification
- **Findings**:
  - All CDK stacks (Auth, Data, API, Hosting) are instantiated in `app.ts` with correct cross-stack references.
  - `cdk synth` and `cdk deploy --all` work correctly.
- **Recommendation**: No issues.

---

### Deploy Infrastructure Pipeline (#51) and Deploy Frontend Pipeline (#52)

- **Verdict**: CONCERN
- **Tested as**: DevOps verification
- **Findings**:
  - Both deployment pipelines are activated and configured with OIDC role assumption, build steps, and deployment commands.
  - The frontend pipeline includes S3 sync and CloudFront invalidation.
  - **However**: The infrastructure pipeline deployed Lambda functions with placeholder code instead of compiled handlers (Issue #73). This means the pipeline technically "works" (it deploys without errors) but the deployed result is non-functional.
- **Recommendation**: Add a post-deploy smoke test (Issue #75) to catch cases where deployment succeeds but the application is broken. Even a basic "GET /expenses returns valid JSON" check would have caught this.

---

### Secret Scanning Hook (#34)

- **Verdict**: CONCERN
- **Tested as**: New User (Open Source Adopter)
- **Findings**:
  - The Claude Code PreToolUse hook scans for secrets in Write/Edit operations.
  - Husky pre-push hook provides a second layer of defense.
  - **However**: The hook configuration format in `.claude/settings.json` has been broken twice already (documented in CLAUDE.md and memory). The format is fragile and not self-documenting. A new contributor could easily break it again.
- **Recommendation**: Add a CI step that validates the `.claude/settings.json` format, and include a clear comment in the file referencing the correct schema documentation.

---

### Bug: Lambda Placeholder Code (#73)

- **Verdict**: FAIL
- **Tested as**: Primary Rep, Secondary Rep, New User
- **Findings**:
  - All Lambda functions were deployed with `Code.fromInline('exports.handler = async () => ({ statusCode: 200 });')` instead of the actual compiled TypeScript handlers.
  - **GET /expenses** returns an empty body. The frontend gracefully shows "No expenses yet" (not an error), which is misleading -- it suggests there are no expenses when in fact the API is non-functional.
  - **POST /expenses** fails with "Failed to execute 'json' on 'Response': Unexpected end of JSON input" because the placeholder returns no body. A red error toast appears, but the message is technical and unhelpful for a non-developer.
  - **POST /categorize** returns empty, so AI categorization does not work.
  - **As a Primary Rep**: I would think the app is empty and start entering expenses, only to get a confusing error on the first submit. Very frustrating.
  - **As a New User**: I would assume the app is broken and abandon it.
  - A fix has been merged (PR #76) but not yet deployed.
- **Recommendation**:
  1. **Deploy PR #76 immediately** -- this is the single most impactful action for the project right now.
  2. **Add CDK assertion tests** (Issue #74) that verify Lambda functions use `Code.fromAsset()` instead of `Code.fromInline()`. This prevents regression.
  3. **Add post-deploy smoke tests** (Issue #75) that verify API endpoints return valid responses after deployment.
  4. **Improve the frontend error message** for POST failures -- instead of showing the raw JSON parse error, show something like "Unable to save your expense. Please try again or contact support."

---

## Cross-Cutting Concerns

### Error Messages Need User-Friendly Treatment

Several API errors surface raw technical messages to the user:
- "Failed to execute 'json' on 'Response': Unexpected end of JSON input" (JSON parse failure)
- "API request failed with status 500" (generic server error)

**Recommendation**: Add a frontend error boundary or API client wrapper that translates technical errors into user-friendly messages. For example:
- 401 -> "Your session has expired. Please log in again."
- 500 -> "Something went wrong on our end. Please try again."
- Network error -> "Unable to reach the server. Check your internet connection."

### No Loading State Feedback After Form Submit

When creating an expense, the submit button shows a loading spinner (good), but if the API is slow, there is no indication of what is happening. The user might click multiple times.

**Recommendation**: Disable the form during submission (already done via `isSubmitting` state) and consider adding a "Saving your expense..." message.

### No Confirmation Before Logout

Clicking Logout immediately ends the session without confirmation. If a user accidentally clicks it while filling out a long expense form, they lose their work.

**Recommendation**: Consider adding a confirmation dialog ("Are you sure you want to log out?") or at minimum warn if there is unsaved form data.

---

## Sprint 3 Summary for Product Owner

### Blockers (must fix before release)

1. **Deploy PR #76** -- The API is non-functional with placeholder Lambda code. This is the only true blocker.

### High Priority (should address soon)

2. **Add post-deploy smoke tests** (Issue #75) -- Prevents future "deployment succeeds but app is broken" scenarios.
3. **Add CDK assertion test for Lambda code source** (Issue #74) -- Prevents regression of Issue #73.
4. **Improve frontend error messages** -- Raw technical errors confuse non-technical users.

### Backlog (future sprint)

5. **Add frontend character limits** matching backend validation (vendor 200, description 1000, etc.)
6. **Preserve requested URL after login redirect** -- Minor UX improvement for bookmarked pages.
7. **Add logout confirmation** when unsaved form data exists.
8. **Validate `.claude/settings.json` format in CI** -- Prevent recurring hook format breakage.

---

## Personas Assessment

### Primary Rep Experience
The Primary Rep can log in, navigate the app, and understand the UI layout. The Add Expense form is well-designed with clear labels, sensible defaults (today's date), and proper validation. AI categorization is a standout feature that saves time. **Blocked by**: API deployment -- cannot create or view expenses.

### Secondary Rep Experience
The Secondary Rep sees the same clean interface. The mobile-responsive sidebar is helpful for occasional phone-based expense entry. **Blocked by**: Same API deployment issue.

### New User (Open Source Adopter) Experience
A new user would find the login page clear and the Dashboard welcoming. However, without documentation on how to set up their own deployment or create a Cognito user, they cannot proceed beyond the login page. The `docs/SETUP.md` provides self-hosting guidance, which is good. **Concern**: No self-registration flow -- users must be admin-created in Cognito.
