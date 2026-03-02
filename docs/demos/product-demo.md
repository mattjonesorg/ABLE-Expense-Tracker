# ABLE Tracker -- Product Demo

> Last updated: Sprint 3, 2026-03-02

## What is ABLE Tracker?

ABLE Tracker is an open-source Progressive Web App (PWA) for managing qualified ABLE (Achieving a Better Life Experience) account expenses. Authorized representatives log out-of-pocket expenses, upload receipts, and use AI-powered categorization to map expenses to the 11 IRS-qualified ABLE categories -- making tax documentation and reimbursement tracking straightforward.

## Who is this for?

- **Primary Representatives** -- Family members who manage an ABLE account day-to-day, entering most expenses and tracking reimbursements
- **Secondary Representatives** -- Occasional users who log expenses on behalf of the beneficiary
- **Open Source Adopters** -- Families discovering the app for their own ABLE account needs

## Live Environment

| Component | URL |
|-----------|-----|
| Frontend  | https://d360ri42g0q6k2.cloudfront.net |
| API       | https://04xlqwybf6.execute-api.us-east-1.amazonaws.com |
| Auth      | AWS Cognito (username/password) |

---

## Demo Walkthrough

### 1. Login

![Login page](screenshots/01-login-page.png)

The login page is the first screen every user sees. It is a clean, centered card with the "ABLE Tracker" title and two form fields.

**Steps:**

1. Navigate to the application URL. If you are not logged in, you will be redirected to the login page automatically.
2. Enter your **email address** in the "Email" field.
3. Enter your **password** in the "Password" field.
4. Click **"Sign in"**.

**What happens:**
- The app authenticates against AWS Cognito using your email and password.
- On success, you are redirected to the Dashboard.
- On failure, a red notification banner appears with the error message (e.g., "Incorrect username or password").

**Verification:**
- [ ] Login page displays "ABLE Tracker" title and email/password fields
- [ ] Empty fields show validation errors ("Email is required", "Password is required")
- [ ] Invalid credentials show a red error notification
- [ ] Successful login redirects to the Dashboard

---

### 2. Auth Guard (Protected Routes)

![Auth redirect](screenshots/02-auth-redirect.png)

All application pages (Dashboard, Expenses, Add Expense) are protected. Unauthenticated users cannot access any data.

**Steps:**

1. Open a new browser tab (or clear your session).
2. Navigate directly to any protected URL (e.g., `/expenses` or `/expenses/new`).
3. Observe that you are automatically redirected to `/login`.

**What happens:**
- The `AppLayout` component checks authentication state on every page load.
- If the user's JWT is missing or expired, the app redirects to the login page.
- No expense data is visible without authentication.

**Verification:**
- [ ] Navigating to `/` without a session redirects to `/login`
- [ ] Navigating to `/expenses` without a session redirects to `/login`
- [ ] Navigating to `/expenses/new` without a session redirects to `/login`
- [ ] After logging in, the user reaches the originally requested page

---

### 3. Dashboard

![Dashboard](screenshots/03-dashboard.png)

The Dashboard is the landing page after login. It greets the user by name and provides quick-action cards for common tasks.

**Steps:**

1. After logging in, you arrive at the Dashboard.
2. Observe the welcome message: **"Welcome, [Your Display Name]"**.
3. See two quick-action cards:
   - **"Add Expense"** -- Record a new qualified ABLE expense
   - **"View Expenses"** -- Browse and manage your expenses

**What happens:**
- The display name is extracted from your Cognito JWT token claims.
- Each card is a clickable link that navigates to the corresponding page.

**Verification:**
- [ ] Dashboard displays "Welcome, [name]" with the logged-in user's display name
- [ ] "Add Expense" card links to `/expenses/new`
- [ ] "View Expenses" card links to `/expenses`
- [ ] Cards are visually distinct with icons (blue plus icon, teal receipt icon)

---

### 4. Navigation

![Sidebar navigation](screenshots/04-navigation-sidebar.png)

The app uses a sidebar navigation layout with a fixed header. On mobile, the sidebar collapses behind a hamburger menu.

**Header (always visible):**
- "ABLE Tracker" title on the left
- User's display name and a **Logout** button on the right

**Sidebar links:**
- **Dashboard** (home icon) -- `/`
- **Expenses** (receipt icon) -- `/expenses`
- **New Expense** (plus icon) -- `/expenses/new`

**Steps:**

1. From any page, observe the sidebar on the left with three navigation links.
2. Click each link to navigate between pages.
3. On the header, observe your display name and the Logout button.
4. Click **Logout** to end your session and return to the login page.

**Mobile behavior:**

1. Resize your browser window to a narrow width (below the `sm` breakpoint).
2. The sidebar collapses and a hamburger icon appears in the header.
3. Tap the hamburger to open/close the sidebar as an overlay.

**Verification:**
- [ ] Three navigation links are visible: Dashboard, Expenses, New Expense
- [ ] Active page is visually highlighted in the sidebar
- [ ] Clicking a link navigates to the correct page
- [ ] Display name appears in the header
- [ ] Logout button ends the session and redirects to login
- [ ] On mobile, sidebar collapses behind a hamburger menu
- [ ] Navigation is fully keyboard accessible (Tab, Enter)

---

### 5. Add Expense Form

![Add Expense form](screenshots/05-add-expense-form.png)

This is the core data entry form where authorized representatives record qualified ABLE expenses.

**Form fields:**

| Field       | Type          | Required | Notes |
|-------------|---------------|----------|-------|
| Vendor      | Text input    | Yes      | e.g., "University Bookstore" |
| Description | Text area     | Yes      | Describe what the expense was for |
| Amount      | Number input  | Yes      | Entered in dollars (e.g., $75.00), converted to cents internally |
| Date        | Date picker   | Yes      | Defaults to today; cannot be a future date |
| Paid By     | Text input    | Yes      | Who paid out-of-pocket for this expense |
| Category    | Select/AI     | No       | One of 11 ABLE categories; can be selected manually or suggested by AI |
| Receipt     | File upload   | No       | Accepts images and PDFs (upload UI present, backend handler exists) |

**Steps:**

1. Navigate to **New Expense** (via sidebar or Dashboard quick action).
2. Fill in the **Vendor** field (e.g., "CVS Pharmacy").
3. Add a **Description** (e.g., "Monthly prescription medications for beneficiary").
4. Enter the **Amount** in dollars (e.g., `45.50`). The `$` prefix is shown automatically. The value is stored as 4550 cents internally.
5. Select or confirm the **Date** (defaults to today).
6. Enter **Paid By** (e.g., "Jane Smith").
7. For **Category**, you have two options:
   - Select manually from the dropdown (see Section 6 below for AI categorization)
   - Click **"Suggest Category"** to let AI choose (see Section 6)
8. Optionally attach a **Receipt** file.
9. Click **"Create Expense"**.

**What happens on submit:**
- The form validates all required fields. Missing fields show inline error messages.
- The amount is converted from dollars to integer cents (e.g., $45.50 becomes 4550).
- A POST request is sent to the API with the expense data.
- On success, a green notification appears: "Your expense has been recorded successfully."
- The user is redirected to the Expense List page.

**Validation rules:**
- Vendor, Description, and Paid By must not be empty
- Amount must be greater than zero
- Date must not be in the future

![Form validation errors](screenshots/05b-form-validation.png)

**Verification:**
- [ ] All required fields show error messages when submitted empty
- [ ] Amount field displays `$` prefix and formats to two decimal places
- [ ] Date picker defaults to today and blocks future dates
- [ ] Category dropdown lists all 11 ABLE categories
- [ ] Success notification appears after creating an expense
- [ ] User is redirected to the expense list after successful creation
- [ ] File input accepts images and PDFs

---

### 6. AI Categorization (Suggest Category)

![AI category suggestion](screenshots/06-ai-categorization.png)

ABLE Tracker integrates with the Claude AI API to automatically suggest which of the 11 IRS-qualified ABLE categories an expense belongs to. This saves time and reduces errors for users who are not familiar with the category definitions.

**The 11 ABLE categories:**

1. Education
2. Housing
3. Transportation
4. Employment training & support
5. Assistive technology & personal support
6. Health, prevention & wellness
7. Financial management & administrative
8. Legal fees
9. Oversight & monitoring
10. Funeral & burial
11. Basic living expenses

**Steps:**

1. On the Add Expense form, enter a **Vendor** and/or **Description**.
   - Example: Vendor = "CVS Pharmacy", Description = "Monthly prescription medications"
2. Click the **"Suggest Category"** button (sparkle icon).
3. The button shows a loading spinner while the AI processes the request.
4. The AI analyzes the vendor and description and selects the most appropriate category.
5. The **Category** dropdown is automatically populated with the suggestion (e.g., "Health, prevention & wellness").
6. You can **accept** the suggestion or **override** it by selecting a different category from the dropdown.

**What happens behind the scenes:**
- The frontend sends only the vendor and description to POST `/categorize` (no PII is ever sent to the AI).
- The Claude API evaluates the text against the 11 ABLE category definitions.
- The response includes a suggested category, confidence level (high/medium/low), and reasoning.
- If the AI cannot determine a category, a yellow notification appears: "AI could not determine a category. Please select one manually."

**Edge cases:**
- If both Vendor and Description are empty, clicking "Suggest Category" shows a yellow warning: "Please enter a vendor and/or description before requesting a category suggestion."
- If the API call fails, a red notification appears with the error details.

**Verification:**
- [ ] "Suggest Category" button has a sparkle icon and loading state
- [ ] AI populates the Category dropdown with a suggestion
- [ ] User can accept or override the AI suggestion
- [ ] Empty vendor/description shows a warning notification
- [ ] API errors show a red notification
- [ ] No personally identifiable information is sent to the AI

---

### 7. Expense List

![Expense list with data](screenshots/07-expense-list.png)

The Expense List page shows all recorded expenses in a table format. It includes filtering capabilities and a prominent "Add Expense" button.

**Table columns:**

| Column     | Description |
|------------|-------------|
| Date       | Formatted as "MMM D, YYYY" (e.g., "Feb 15, 2026") |
| Vendor     | The business or entity that was paid |
| Category   | The ABLE category assigned to the expense |
| Amount     | Formatted as currency (e.g., "$75.00") |
| Paid By    | Who paid out-of-pocket |
| Reimbursed | Badge showing "Yes" (green) or "No" (gray) |

**Filters:**

The filter bar at the top of the table provides three filter controls:

1. **Category** -- Dropdown to filter by any of the 11 ABLE categories (or "All categories")
2. **From date** -- Date picker for the start of a date range
3. **To date** -- Date picker for the end of a date range
4. **Clear filters** -- Button to reset all filters

**Steps:**

1. Navigate to **Expenses** from the sidebar.
2. If expenses exist, they appear in a striped, hover-highlighted table.
3. Use the **Category** dropdown to filter by a specific ABLE category.
4. Use the **From date** and **To date** pickers to filter by date range.
5. Click **"Clear filters"** to reset all filters.
6. Click **"Add Expense"** (top right) to create a new expense.

**Empty state:**

![Empty expense list](screenshots/07b-expense-list-empty.png)

If no expenses have been recorded yet, the page shows a friendly empty state with a receipt icon and the message: "No expenses yet. Add your first expense to get started." with a link to the Add Expense form.

**Verification:**
- [ ] Table displays all expenses with correct formatting
- [ ] Amount is formatted as currency (e.g., "$75.00")
- [ ] Date is formatted as "MMM D, YYYY"
- [ ] Reimbursed column shows colored badges (green for Yes, gray for No)
- [ ] Category filter dropdown includes all 11 ABLE categories
- [ ] Date range filter restricts displayed expenses
- [ ] "Clear filters" resets all filter controls
- [ ] Empty state shows a helpful message with a link to add an expense
- [ ] "Add Expense" button in the header links to the form
- [ ] Table rows are clickable (cursor changes to pointer)

---

### 8. Logout

![Logout](screenshots/08-logout.png)

**Steps:**

1. From any page, click the **Logout** button in the top-right corner of the header.
2. The session is cleared (tokens removed from sessionStorage).
3. You are redirected to the login page.

**Verification:**
- [ ] Logout button is always visible in the header
- [ ] Clicking Logout clears the session
- [ ] After logout, navigating to any protected route redirects to login
- [ ] Refreshing the page after logout does not restore the session

---

## Infrastructure Overview

ABLE Tracker runs on a fully automated AWS infrastructure, defined entirely in CDK (Infrastructure as Code). No manual console changes.

| Layer | Service | Purpose |
|-------|---------|---------|
| Auth | AWS Cognito | User authentication with email/password, JWT tokens |
| Frontend | S3 + CloudFront | Static PWA hosting with HTTPS and global CDN |
| API | API Gateway (HTTP API) | RESTful endpoints with JWT authorizer |
| Compute | AWS Lambda (TypeScript) | Serverless request handlers |
| Database | DynamoDB (single-table) | Expense storage with GSI for category and paidBy queries |
| Storage | S3 (private) | Receipt file storage via presigned upload URLs |
| AI | Claude API (Sonnet) | Expense categorization into 11 ABLE categories |
| CI/CD | GitHub Actions | Automated tests, security review, and deployment pipelines |

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST   | `/expenses` | Create a new expense |
| GET    | `/expenses` | List expenses (with optional category/date filters) |
| GET    | `/expenses/{id}` | Get a single expense by ID |
| POST   | `/expenses/{id}/reimburse` | Mark an expense as reimbursed |
| POST   | `/categorize` | AI categorization of an expense |
| POST   | `/upload-url` | Get a presigned S3 URL for receipt upload |

All API endpoints require a valid Cognito JWT in the `Authorization: Bearer <token>` header. Requests without valid authentication receive a 401 response at the API Gateway level (defense-in-depth: Lambda handlers also validate auth context).

### Security Measures

- **API Gateway JWT authorizer** -- All routes require Cognito JWT validation before reaching Lambda
- **Lambda-level auth validation** -- Defense-in-depth; handlers verify auth context independently
- **CORS restriction** -- API only accepts requests from the deployed frontend domain and localhost
- **Input validation** -- String length limits, amount validation, receipt key scoping
- **Generic error messages** -- Auth failures return generic messages; no implementation details leaked
- **Secret scanning** -- Pre-commit hook and CI pipeline scan for leaked secrets/credentials
- **No PII to AI** -- Only vendor name and description are sent to the Claude API; no account numbers, SSNs, or personal data

---

## Coming Soon

The following features are planned but not yet implemented:

### Reimbursement Tracking (Issues #10, #16, #65)
- **What**: Mark expenses as reimbursed, track who is owed what, dashboard summary showing total outstanding per person
- **Why**: This closes the core workflow loop: log expense -> categorize -> reimburse
- **Status**: Backend data model supports it (reimbursed/reimbursedAt fields exist); UI and API handler not yet built

### Receipt Upload UI
- **What**: Frontend interface for attaching receipt photos/PDFs to expenses
- **Why**: Receipts are essential for tax documentation of ABLE expenses
- **Status**: Backend presigned URL handler exists; file input is on the form; upload wiring not yet complete

### Reporting Page (Issues #35, #64)
- **What**: Reports section with expense summaries by category, date range, and reimbursement status
- **Why**: ABLE account holders need reports for tax documentation and financial planning
- **Status**: Navigation link planned; page is placeholder

### Export to CSV/PDF (Issue #24)
- **What**: Export filtered expenses for tax preparation
- **Status**: Not started

### Dark Mode (Issue #26)
- **What**: Dark color scheme toggle, respecting system preferences
- **Status**: Not started

### OCR Receipt Scanning (Issue #23)
- **What**: Auto-extract vendor, amount, and date from receipt photos
- **Status**: Not started

---

## Known Limitations

### API Deployment Gap (Issue #73, fixed in PR #76)

**Status: Fix merged, awaiting deployment**

The Lambda functions are currently deployed with placeholder inline code that returns empty 200 responses. This means:

- **GET /expenses** returns an empty list (the frontend handles this gracefully, showing "No expenses yet")
- **POST /expenses** fails with a JSON parse error ("Unexpected end of JSON input") because the placeholder returns no body
- **POST /categorize** returns empty -- AI categorization does not work against the live API

PR #76 fixes this by replacing `Code.fromInline()` with `Code.fromAsset()` pointing to the compiled TypeScript handlers. Once deployed, all API endpoints will process real data.

**Impact on this demo**: Until the fix is deployed, the live site shows the UI correctly but API operations (creating expenses, listing data, AI categorization) do not work end-to-end. The frontend, navigation, auth flow, and form UX can all be evaluated independently of the API.

### No Self-Registration

New users cannot sign up on their own. User accounts must be created by an administrator in the Cognito console. This is by design for security (prevents unauthorized access to ABLE account data), but a managed invitation flow is planned.

### No Expense Editing or Deletion

Once an expense is created, it cannot be edited or deleted through the UI. This will be addressed in a future sprint.

### No Expense Detail View

Clicking a table row in the expense list logs the expense ID to the console but does not navigate to a detail page. A dedicated expense detail view is planned.

### Mobile Optimization

The app is responsive (sidebar collapses on narrow screens), but has not been optimized specifically for mobile touch targets, swipe gestures, or native-app-like interactions.

---

## How to Run This Demo

### Prerequisites

1. A user account created in the ABLE Tracker Cognito User Pool (contact the project maintainer)
2. A modern web browser (Chrome, Firefox, Safari, Edge)

### Steps

1. Open https://d360ri42g0q6k2.cloudfront.net in your browser.
2. Log in with your credentials.
3. Explore the Dashboard, navigate between pages, and try the Add Expense form.
4. After API deployment (PR #76), test the full flow: create expenses, use AI categorization, and view the expense list.

### For Developers

See `docs/SETUP.md` for self-hosting instructions and `docs/CONTRIBUTING.md` for contribution guidelines. The full infrastructure can be deployed to your own AWS account using CDK.
