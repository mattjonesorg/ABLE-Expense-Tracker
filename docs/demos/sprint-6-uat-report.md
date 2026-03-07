# Sprint 6 UAT Report

> **Date:** 2026-03-07
> **Tester:** UAT Tester (automated + manual verification)
> **Environment:** Production (CloudFront + API Gateway)

## Sprint 6 Scope

| PR | Issue | Feature | Status |
|----|-------|---------|--------|
| #113 | #111 | Fix smoke test to send fileSize for upload URL endpoint | Merged |
| #114 | #110 | Deploy Infrastructure workflow triggers on api/ changes | Merged |
| #115 | #35 | Annual report — per-person breakdown + date presets | Merged |
| #116 | #17 | Playwright E2E testing framework + login spec | Merged |
| #117 | #48 | Structured Lambda logging + CloudWatch alarms | Merged |
| #118 | #19 | Security audit — input limits, S3 IAM scoping, auth checks | Merged |
| #119 | #20 | Accessibility audit — WCAG 2.1 AA compliance fixes | Merged |

## Test Results

### Automated Tests

| Suite | Tests | Result |
|-------|-------|--------|
| Web (Vitest + RTL) | 280 | All passing |
| API (Vitest) | 231 | All passing |
| **Total** | **511** | **All passing** |

### Screenshot Verification (Live App)

| Screenshot | Feature | Verified |
|------------|---------|----------|
| 01-login-page | Login page renders | Yes |
| 02-auth-redirect | Auth guard redirects to login | Yes |
| 03-dashboard | Dashboard with quick actions | Yes (note: dashboard data shows "Failed to load" due to 501 stub) |
| 04-navigation | 5 sidebar links including Reports | Yes |
| 05-expense-form | Add Expense form with all fields | Yes |
| 06-ai-categorization | AI suggest category flow | Yes |
| 07-expense-list | Expenses table with Reimbursement Status filter | Yes |
| 09-mobile-nav | Mobile hamburger menu | Yes |
| 11-reimbursements | Reimbursements with Mark Reimbursed buttons, no truncation | Yes |
| 12-reports | Reports page with summary cards, category breakdown, **per-person breakdown**, and **date presets** | Yes |
| 13-expense-filter | Expenses page showing filter bar | Yes |
| 10-logout | Logout button in header | Yes |

## UAT Findings

### Blockers

None.

### Issues Found

| # | Severity | Description | Action |
|---|----------|-------------|--------|
| 1 | Low | Dashboard shows "Failed to load dashboard data" because `/dashboard/reimbursements` returns 501 (stub) | Known limitation — documented in demo script |
| 2 | Info | Reports "By Person" table shows mostly "Smoke Test Runner" entries because demo data is primarily smoke test data | Cosmetic — table structure and calculations are correct |
| 3 | Info | Issue #120 created for axe-core integration (automated accessibility testing) | Backlog for Sprint 7 |
| 4 | Info | Issue #121 created for date picker accessibility improvements | Backlog for Sprint 7 |

### Sprint 6 Feature Acceptance

| Feature | Acceptance Criteria | Result |
|---------|-------------------|--------|
| **Smoke test fileSize fix (#111)** | `POST /uploads/request-url` smoke test sends `fileSize` and passes | **PASS** — Fix merged in PR #113 |
| **Deploy trigger fix (#110)** | `deploy-infra.yml` triggers on `api/**` path changes | **PASS** — Workflow updated in PR #114 |
| **Annual report — per-person breakdown (#35)** | Reports page shows By Person table with count, total, reimbursed, unreimbursed columns; date preset buttons | **PASS** — Screenshot 12 confirms By Person table and 5 preset buttons (This Month, Last Month, This Year, Last Year, All Time) |
| **Playwright E2E (#17)** | Playwright config, auth helper, login spec, GitHub Actions workflow | **PASS** — Framework in place with critical path login test |
| **Structured Lambda logging (#48)** | All handlers emit structured JSON logs with request IDs; CloudWatch alarms for 5xx and latency | **PASS** — Unit tests pass; CDK stack tests verify log groups and alarms |
| **Security audit (#19)** | Input length limits on categorize endpoint, categoryNotes limit, S3 IAM prefix scoping, stub auth check | **PASS** — 4 findings fixed; `docs/SECURITY.md` published |
| **Accessibility audit (#20)** | Skip-to-content link, heading hierarchy, ARIA labels/live regions, keyboard navigation | **PASS** — 8 WCAG fixes applied; `docs/ACCESSIBILITY.md` published; 23 new tests |

## Demo Script Updates

The product demo script (`docs/demos/product-demo.md`) has been updated for Sprint 6:

- "Last updated" changed to Sprint 6, 2026-03-07
- Navigation section: Added skip-to-content link description and verification item
- Reports section rewritten: Added per-person breakdown table, date range quick presets, updated steps and verification checklist
- Infrastructure table: Added Logging (CloudWatch), Monitoring (CloudWatch Alarms), E2E Testing (Playwright)
- Security section: Updated IAM description (S3 prefix scoping), input validation (categoryNotes, categorize limits), added structured logging, CloudWatch monitoring, accessibility, security audit doc references
- Known Limitations: Added Dashboard Reimbursements Endpoint section (501 stub)
- Developer section: Added links to `docs/SECURITY.md` and `docs/ACCESSIBILITY.md`, Playwright E2E instructions

## Test Count Growth

| Sprint | Web Tests | API Tests | Total |
|--------|-----------|-----------|-------|
| Sprint 5 | 244 | 209 | 453 |
| Sprint 6 | 280 | 231 | 511 |
| **Delta** | **+36** | **+22** | **+58** |

## Recommendation

**Sprint 6 is ready for release.** All 7 items pass acceptance criteria. No blockers found. Two informational accessibility issues (#120, #121) are backlogged for Sprint 7.
