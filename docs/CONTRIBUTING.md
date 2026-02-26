# Contributing to ABLE Tracker

## AI-Assisted Development with Engineering Guardrails

This project is built with AI coding assistants (Claude Code) operating under strict engineering guardrails. What this means for contributors:

- **AI writes code, humans set standards.** The AI agents follow the same TDD, linting, and CI/CD requirements as any human contributor.
- **Tests are non-negotiable.** Every feature has tests written before implementation. AI-generated code without tests will not be merged.
- **The guardrails are the point.** This project demonstrates that AI-assisted development and disciplined engineering practices are complementary, not contradictory.

You are welcome to contribute with or without AI assistance — the same standards apply to all code regardless of how it was written.

## Getting Started

### Fork and Clone

```bash
git clone https://github.com/<your-username>/ABLE-Expense-Tracker.git
cd ABLE-Expense-Tracker
```

### Dev Setup

```bash
corepack enable
pnpm install
pnpm build
pnpm test
```

## Branch Naming

Use the format: `<type>/<issue-number>-<short-description>`

Examples:
- `feat/42-expense-form`
- `fix/87-date-validation`
- `test/15-category-api`
- `docs/23-setup-guide`
- `chore/31-upgrade-mantine`

Types: `feat`, `fix`, `test`, `docs`, `chore`, `ci`, `refactor`

## TDD Requirement

**Write tests BEFORE implementation. No exceptions.**

The workflow for every change:

1. Write a failing test that describes the expected behavior
2. Run the test — confirm it fails
3. Write the minimum code to make the test pass
4. Refactor if needed while keeping tests green

This applies to:
- Lambda handlers
- React components
- CDK infrastructure
- Utility functions

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short description>

[optional body]

[optional footer]
```

Types:
- `feat:` — new feature
- `fix:` — bug fix
- `test:` — adding or updating tests
- `docs:` — documentation only
- `chore:` — maintenance, dependency updates
- `ci:` — CI/CD pipeline changes
- `refactor:` — code restructuring without behavior change

Examples:
```
feat: add expense creation form with receipt upload
fix: correct date parsing for non-US locales
test: add integration tests for categorize handler
```

## Pull Request Process

1. **Reference the issue** — every PR should link to a GitHub issue
2. **CI must pass** — build, lint, and all tests must be green
3. **Code Reviewer approves** — at least one review approval is required
4. **Keep PRs focused** — one feature or fix per PR

PR title should follow the same conventional commit format as commit messages.

## Testing Expectations

| Layer | Tool | Location |
|---|---|---|
| API unit/integration | Vitest + aws-sdk-client-mock | `api/test/` |
| React components | Vitest + React Testing Library | `web/test/` |
| Infrastructure | Vitest + CDK assertions | `infra/test/` |

- Use `describe` / `it` blocks with clear descriptions
- Test behavior, not implementation details
- Mock external dependencies (AWS services, APIs) at the boundary
- Aim for meaningful coverage, not 100% line coverage

## TypeScript

- **Strict mode is enabled** — no opt-outs
- **No `any` types** — use `unknown` and narrow with type guards if the type is truly unknown
- Shared types live in `api/src/lib/types.ts` and are mirrored in `web/src/lib/types.ts`
- Prefer interfaces for object shapes, type aliases for unions and utility types

## Questions?

Open an issue with the `question` label or start a discussion.
