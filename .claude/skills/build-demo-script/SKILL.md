# Skill: Build Demo Script

## Purpose

Refresh the product demo script (`docs/demos/product-demo.md`) with fresh screenshots and updated content. This automates the sprint-end UAT demo workflow that was previously done through manual multi-agent coordination.

## When to Use

- At the end of each sprint, to update the demo documentation with newly implemented features
- When the UI has changed and screenshots are stale
- When a stakeholder requests an up-to-date product walkthrough
- After a deployment, to verify the live app matches the documentation

## Prerequisites

- For CI artifact download: `gh` CLI authenticated (preferred method)
- For live capture: Playwright installed + `DEMO_EMAIL` and `DEMO_PASSWORD` environment variables set
- For local capture: the Vite dev server will be started automatically by the capture script

## Procedure

This skill coordinates three agents working sequentially:

### Phase 1: QA Engineer — Capture Screenshots

The QA Engineer obtains screenshots of all implemented features, preferring CI artifacts over local capture.

**Steps:**

1. **Try CI artifacts first** (preferred — most accurate, captured against real ephemeral infrastructure):
   a. Find the most recent successful `ephemeral-e2e` workflow run that produced screenshots:
      ```bash
      gh run list --workflow=ephemeral-e2e.yml --status=success --limit=5 --json databaseId,headBranch,conclusion,createdAt
      ```
   b. Download the `demo-screenshots-pr-*` artifact from that run:
      ```bash
      gh run download <run-id> --name 'demo-screenshots-pr-<number>' --dir docs/demos/screenshots/
      ```
   c. If the artifact downloads successfully, verify the files are present and non-empty, then skip to Phase 2.

2. **Fall back to live capture** (if no CI artifact is available or artifacts are stale):
   - **Live deployed environment** (requires credentials): `DEMO_EMAIL=<email> DEMO_PASSWORD=<pass> node docs/demos/capture-screenshots.mjs`
   - **Local dev** (no credentials needed, less accurate): `node docs/demos/capture-local-screenshots.mjs`
   - Ensure Playwright is installed: `pnpm exec playwright install chromium`

3. Run the selected capture method from the repository root.
4. Verify screenshots were written to `docs/demos/screenshots/`.
5. Review each screenshot file — confirm they are non-empty and show the expected UI state.
6. If any screenshots fail to capture, note which ones failed and why (e.g., selector not found, timeout, no artifact).

**Screenshot inventory (current as of Sprint 9):**

| File | Feature |
|------|---------|
| `01-login-page.png` | Login form |
| `02-auth-redirect.png` | Auth guard redirect |
| `03-dashboard.png` | Dashboard with reimbursements and recent expenses |
| `04-navigation.png` | Sidebar navigation |
| `05-expense-form.png` | Add Expense form (empty) |
| `06-ai-categorization.png` | AI Suggest Category with filled fields |
| `07-expense-list.png` | Expense list with data |
| `08-expense-list-empty.png` | Expense list empty state |
| `09-mobile-nav.png` | Mobile hamburger menu |
| `10-logout.png` | Logout button hover state |
| `11-reimbursements.png` | Reimbursements page with bulk selection |
| `12-reports.png` | Reports page with filters and summaries |
| `13-expense-filter.png` | Expense list with category/date filters |
| `14-bulk-reimburse.png` | Bulk reimbursement selection state |

When new features are implemented, add new screenshot entries to the capture script and this inventory.

**Output:** Fresh screenshots in `docs/demos/screenshots/` and a list of any capture failures.

### Phase 2: UAT Tester — Update Demo Script

The UAT Tester updates `docs/demos/product-demo.md` to reflect the current state of the application.

**Steps:**

1. Read the current demo script at `docs/demos/product-demo.md`.
2. Read the current source code to understand what features are implemented:
   - `web/src/` for frontend routes and components
   - `api/src/` for API endpoints and handlers
   - `infra/` for infrastructure definitions
3. For each section in the demo script:
   - Verify the description matches the actual implementation.
   - Update screenshot references if filenames changed.
   - Add new sections for any features implemented since the last update.
   - Move features from "Coming Soon" to the main walkthrough when they are implemented.
   - Update the "Known Limitations" section to reflect resolved issues.
4. Ensure all screenshot references point to files that exist in `docs/demos/screenshots/`.
5. Update the "Last updated" line at the top with the current sprint number and date.
6. Use deployment-agnostic URL placeholders (e.g., `<your-cloudfront-url>`) — never hardcode environment-specific URLs.
7. Maintain the verification checklists in each section.

**Quality checks:**
- Every implemented user-facing feature has a section with a screenshot
- All screenshot references resolve to real files
- No hardcoded deployment URLs
- Step-by-step instructions are accurate for the current UI
- "Coming Soon" only lists features that are truly not yet implemented

**Output:** Updated `docs/demos/product-demo.md` with accurate content and screenshot references.

### Phase 3: Product Owner — Triage Issues

The Product Owner reviews the updated demo script and screenshots, triaging any discrepancies found.

**Steps:**

1. Read the updated `docs/demos/product-demo.md`.
2. Review screenshots in `docs/demos/screenshots/` to confirm they show the expected UI.
3. Compare the demo script against the current sprint's completed issues (check GitHub):
   ```bash
   gh issue list --state closed --label "status:done" --limit 20 --repo mattjonesorg/ABLE-Expense-Tracker
   ```
4. For each discrepancy or issue found:
   - **Blocker** (user cannot complete a core task): Flag it and stop — this must be fixed before the demo ships.
   - **Backlog** (cosmetic, minor UX issue, or missing polish): Create a GitHub issue with the `priority:medium` or `priority:low` label.
5. Produce a summary of findings:

```markdown
## Demo Script Review — Sprint [N]

### Blockers (must fix)
- [ ] [Description of blocker, if any]

### New Backlog Issues Created
- #XX — [issue title]
- #YY — [issue title]

### Verdict
[APPROVED / BLOCKED — reason]
```

**Output:** Triage summary and any new GitHub issues created.

## Output Format

When the skill completes, produce a final summary:

```markdown
## Demo Script Refresh — Sprint [N]

### Screenshots
- Captured: [X] of [Y] screenshots
- Failed: [list any failures]
- New screenshots added: [list any new ones]

### Demo Script Updates
- Sections added: [list new sections]
- Sections updated: [list modified sections]
- Issues found: [count]

### Triage
- Blockers: [count] — [NONE / list]
- Backlog issues created: [list with issue numbers]

### Final Status
[COMPLETE / BLOCKED — details]
```

## Extending the Capture Scripts

When new features are implemented that need screenshots:

1. Edit `docs/demos/capture-local-screenshots.mjs` (for local dev) to add a new screenshot block following the existing pattern:
   ```javascript
   // -------------------------------------------------------
   // NN — Feature Name
   // -------------------------------------------------------
   console.log('Capturing NN-feature-name...');
   await page.goto(`${APP_URL}/route`, { waitUntil: 'networkidle' });
   // ... interact with the page as needed ...
   await page.screenshot({
     path: path.join(SCREENSHOTS_DIR, 'NN-feature-name.png'),
     fullPage: false,
   });
   console.log('  OK');
   ```
2. If the feature also needs to work with the live deployed capture script, add the corresponding block to `docs/demos/capture-screenshots.mjs` as well.
3. Update the screenshot inventory table in this skill file.

## Error Handling

- If Playwright is not installed, run `pnpm exec playwright install chromium` and retry.
- If the local dev server fails to start, check that `pnpm install` has been run in the `web/` workspace.
- If screenshots are blank or show error pages, check the browser console output from the capture script for clues.
- If login fails on the live capture script, verify the `DEMO_EMAIL` and `DEMO_PASSWORD` environment variables are correct.
