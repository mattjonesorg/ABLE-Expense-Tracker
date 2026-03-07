# ABLE Tracker -- Accessibility

## Standard

ABLE Tracker targets **WCAG 2.1 Level AA** compliance. This application serves people managing accounts for individuals with disabilities -- accessibility is core to the mission, not an afterthought.

## Audit Summary (Sprint 3)

An accessibility audit was conducted across all UI pages and components. The following categories were reviewed:

### Findings and Remediations

#### 1. Skip to Main Content Link
- **Finding**: No skip link existed. Keyboard users had to tab through the full navigation on every page load.
- **Remediation**: Added a visually hidden "Skip to main content" link in `AppShell.tsx` that becomes visible on focus. Links to `#main-content` on the `<main>` element.
- **WCAG criterion**: 2.4.1 Bypass Blocks (A)

#### 2. Heading Hierarchy
- **Finding**: Page titles used `<h2>` as the top-level heading, with no `<h1>` on any protected page. The app title in the header was rendered as `<h3>`, creating a broken hierarchy (h3 -> h2 with no h1).
- **Remediation**: Changed all page titles to `<h1>` (Dashboard, Expenses, New Expense, Reimbursements, Reports). Changed app title in the header from `<h3>` to styled `<Text>` since it functions as a logo/brand, not a content heading. Sub-sections now use `<h2>`.
- **WCAG criterion**: 1.3.1 Info and Relationships (A)

#### 3. Loading State Announcements
- **Finding**: Loading skeletons were visual-only. Screen reader users had no indication that content was loading.
- **Remediation**: Added `role="status"` and descriptive `aria-label` attributes to all loading skeleton containers (Dashboard, Expenses, Reimbursements, Reports).
- **WCAG criterion**: 4.1.3 Status Messages (AA)

#### 4. Error State Announcements
- **Finding**: Dashboard error message used `<Text c="red">` with no semantic indication of an error. (Reimbursements page already used `role="alert"` correctly.)
- **Remediation**: Added `role="alert"` to the Dashboard error container so screen readers announce failures immediately.
- **WCAG criterion**: 4.1.3 Status Messages (AA)

#### 5. Decorative Icons Hidden from Screen Readers
- **Finding**: Tabler icons used alongside text labels (in navigation, buttons, summary cards, empty states) did not have `aria-hidden="true"`. Screen readers would attempt to read SVG markup.
- **Remediation**: Added `aria-hidden="true"` to all decorative icons across AppShell, Dashboard, Expenses, ExpenseForm, Reimbursements, and Reports.
- **WCAG criterion**: 1.1.1 Non-text Content (A)

#### 6. Inaccessible Clickable Table Rows
- **Finding**: Expense table rows had `onClick` handlers and `cursor: pointer` styling but were not keyboard-accessible (no `tabIndex`, no `onKeyDown` for Enter/Space). The click handler was a placeholder (console.log only).
- **Remediation**: Removed the non-functional click handler and cursor styling. When expense detail navigation is implemented, it should use proper links or keyboard-accessible interactive elements.
- **WCAG criterion**: 2.1.1 Keyboard (A)

#### 7. Table Accessibility Labels
- **Finding**: Data tables lacked accessible names to help screen reader users distinguish between multiple tables.
- **Remediation**: Added `aria-label` to all data tables: "Expense list" (Expenses), "Unreimbursed expenses" (Reimbursements), "Expenses by category" (Reports).
- **WCAG criterion**: 1.3.1 Info and Relationships (A)

#### 8. Form Accessibility Labels
- **Finding**: Forms did not have accessible names. While form inputs had proper labels, the `<form>` elements themselves lacked identification.
- **Remediation**: Added `aria-label` to both forms: "Sign in form" (Login), "New expense form" (ExpenseForm).
- **WCAG criterion**: 1.3.1 Info and Relationships (A)

### Items Already Correct (No Changes Needed)

- `<html lang="en">` is set in `index.html`
- Burger menu has `aria-label="Toggle navigation"`
- Navigation sidebar has `aria-label="Main navigation"` and uses `<nav>` landmark
- `<main>` landmark is rendered by Mantine's `AppShell.Main`
- All form inputs have associated labels via Mantine's `label` prop
- Required fields have `aria-required="true"`
- "Mark Reimbursed" buttons have descriptive `aria-label` including vendor name
- Error alert on Reimbursements page uses `role="alert"` with a close button
- Login form inputs use correct `type` attributes (`email`, `password`)
- Mantine's `Notifications` component provides ARIA live region announcements

## Known Limitations

1. **No automated axe-core integration** -- The project does not yet include `@axe-core/react` for automated accessibility scanning in tests. This should be added as a future enhancement.
2. **Color contrast not programmatically verified** -- Red amounts in the Reimbursements page (`c="red.6"`) and dimmed text (`c="dimmed"`) rely on Mantine's default theme colors, which generally meet WCAG AA contrast ratios, but have not been verified with a contrast checker tool against all backgrounds.
3. **No screen reader testing** -- Fixes have been designed following WCAG best practices, but manual testing with NVDA, VoiceOver, or JAWS has not yet been performed.
4. **PWA install prompt** -- The browser-native install prompt has not been evaluated for accessibility.
5. **Date picker accessibility** -- Mantine's `DateInput` component provides basic keyboard support but the calendar popup may present challenges for screen reader users. This should be validated with manual testing.

## Testing Approach

### Automated Tests

Accessibility-specific tests are in `web/test/accessibility.test.tsx` and cover:

- Skip-to-content link presence and target
- Heading hierarchy (h1 for page titles, h2 for sub-sections)
- Landmark regions (navigation with accessible name, main content)
- Loading state screen reader announcements (`role="status"`, `aria-label`)
- Error state screen reader announcements (`role="alert"`)
- Decorative icon hiding (`aria-hidden="true"`)
- Table accessible labels (`aria-label`)
- Form accessible labels (`aria-label`)
- Absence of mouse-only interactions on table rows

### Existing Tests with Accessibility Coverage

Several existing test files already verify accessibility features:

- `AppShell.test.tsx` -- Tests navigation landmark, burger button aria-label
- `Login.test.tsx` -- Tests form labels, input types, keyboard form submission
- `ExpenseForm.test.tsx` -- Tests field labels, `aria-required` attributes
- `Reimbursements.test.tsx` -- Tests button `aria-label` with vendor names, `role="alert"` for errors

### Recommended Future Testing

1. Add `@axe-core/react` for automated WCAG scanning in component tests
2. Add Playwright tests for keyboard navigation flows (tab order through the app)
3. Manual testing with screen readers (VoiceOver on macOS, NVDA on Windows)
4. Contrast ratio verification using browser DevTools or axe
5. Mobile touch target size verification (44x44px minimum)
