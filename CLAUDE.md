# ABLE Tracker — Project Intelligence

## Project Overview

ABLE Tracker is an open-source PWA for tracking qualified ABLE account expenses and reimbursements. Multiple authorized representatives log expenses, upload receipts, and track who is owed reimbursement. Claude AI assists with mapping expenses to IRS-qualified ABLE categories.

### Dual Purpose

1. **Practical utility** — Fill a real gap in ABLE account management tooling.
2. **Reference implementation for AI-driven development** — Demonstrate that AI coding assistants and disciplined engineering practices are complementary. Every guardrail (TDD, CI/CD, strict TypeScript, tested infrastructure) exists to make AI-driven development reliable and trustworthy.

## Tech Stack

- **Monorepo**: pnpm workspaces + corepack
- **Frontend**: React + Vite PWA + Mantine v7 + Tabler Icons
- **Auth**: AWS Cognito (username/password)
- **API**: API Gateway (HTTP API) + Lambda (TypeScript)
- **Database**: DynamoDB (single-table design)
- **Storage**: S3 + presigned URLs
- **AI**: Claude API (Sonnet) for expense categorization
- **IaC**: AWS CDK (TypeScript)
- **Testing**: Vitest + React Testing Library + aws-sdk-client-mock + MSW + Playwright
- **CI/CD**: GitHub Actions

## Prioritization Scheme

This scheme is used by the Product Owner to prioritize the backlog AND by the choose-next-issue skill to select work. They MUST stay in sync.

### Priority Tiers

| Tier | Label | Description | Examples |
|------|-------|-------------|----------|
| P0 | `priority:critical` | Foundation — nothing works without this | Auth, DynamoDB table, CDK stacks, CI pipeline |
| P1 | `priority:high` | Core flow — the happy path that delivers user value | Add expense, categorize, track reimbursement, dashboard |
| P2 | `priority:medium` | Engineering excellence — demonstrates the AI-driven dev story | Test coverage, documentation, security hardening |
| P3 | `priority:low` | Enhancement — UX polish and additional features | Dark mode, charts, export, recurring templates |
| P4 | `priority:backlog` | Future — valuable but not near-term | Multi-beneficiary, Terraform, local demo mode |

### Scoring Formula (for ordering within a tier)

```
Score = (User_Impact × Dev_Story_Impact × Dependency_Weight) / Effort
```

- **User_Impact** (1–5): How much this improves the experience for ABLE account managers
- **Dev_Story_Impact** (1–5): How well this demonstrates AI-driven development practices (TDD, CI/CD, tested infra, etc.)
- **Dependency_Weight** (0.5–2.0): 2.0 if other issues are blocked by this; 1.0 if independent; 0.5 if it depends on unfinished work
- **Effort** (1–5): Size of work (1=XS, 2=S, 3=M, 4=L, 5=XL)

### Ordering Rules

1. Always work top-down by tier (finish P0 before starting P1)
2. Within a tier, pick the highest-scoring issue
3. Never skip a blocking issue — if issue B depends on issue A, A comes first regardless of score
4. Balance across agents — don't starve any agent of work; prefer parallel-safe issues when possible
5. If two issues score equally, prefer the one that unblocks more downstream work

## Engineering Standards

These are non-negotiable. Every agent must follow them. They are the guardrails that make AI-driven development trustworthy.

### Test-Driven Development

- Write tests BEFORE implementation. No exceptions.
- Tests define the contract. Implementation satisfies the contract.
- Test files live in `test/` directories mirroring `src/` structure.
- Minimum coverage targets: 80% line coverage for `api/`, 70% for `web/`.

### TypeScript

- Strict mode everywhere. `"strict": true` in all tsconfigs.
- No `any` types. Use `unknown` and narrow with type guards.
- No `@ts-ignore` or `@ts-expect-error` without a comment explaining why.
- Shared types live in each package's `src/lib/types.ts`.

### Code Quality

- All money values stored as integers (cents). Never use floating point for money.
- Use ULID for generated IDs (sortable, unique).
- No PII sent to Claude API — expense descriptions only.
- Never store ABLE account numbers or SSNs.

### Infrastructure

- All infrastructure defined in CDK (no manual console changes).
- CDK stacks have assertion tests.
- IAM policies follow least-privilege principle.
- S3 buckets are private by default.

### CI/CD

- All tests must pass before merge.
- CI runs on every PR and push to main.
- Deployments are automated through GitHub Actions.

### Git Conventions

- Branch naming: `<type>/<issue-number>-<short-description>` (e.g., `feat/42-expense-form`)
- Commit messages: Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `ci:`)
- Every PR references the GitHub issue it addresses
- PRs require passing CI before merge

## Agent Team

This project uses a 12-agent team. See `.claude/agents/` for individual agent definitions.

| Agent | Primary Responsibility | Owned Areas |
|-------|----------------------|-------------|
| Scrum Master | Orchestration, sprint planning, workflow | Sprint ceremonies, agent coordination |
| Product Owner | Backlog prioritization, acceptance criteria | GitHub issues, requirements |
| Senior Architect | System design, technical decisions, **plans L/XL features** (does not implement) | Architecture docs, cross-cutting concerns |
| Frontend Engineer | React PWA, Mantine UI | `web/` |
| Backend Engineer | Lambda handlers, DynamoDB, Claude integration | `api/` |
| DevOps Engineer | CDK infrastructure, CI/CD pipelines | `infra/`, `.github/workflows/` |
| QA Engineer | Test strategy, coverage, **pre-commit review gate** | `**/test/`, test utilities |
| UAT Tester | User advocacy, demo scripts, acceptance testing | `docs/demos/`, acceptance criteria verification |
| Security Reviewer | Auth, data protection, IAM, PII, **pre-commit review gate** | Security-sensitive code across all packages |
| Technical Writer | Documentation quality and completeness | `docs/`, `README.md`, inline docs |
| Code Reviewer | Engineering standards enforcement | PR reviews, code quality gates |
| Accessibility Engineer | WCAG compliance, keyboard nav, screen readers | Accessibility across `web/` |

## Workflow

### Sprint Cycle

1. **Sprint Planning**: Scrum Master facilitates. Product Owner presents prioritized issues. Team estimates and commits. **L/XL issues go to the Architect for planning first.**
2. **Architecture Planning** (L/XL only): Senior Architect produces implementation plan (API contracts, data model, component breakdown, test strategy). Architect does NOT implement.
3. **Development**: Implementing agents work on assigned issues following TDD. Backend and Frontend can work in parallel on agreed interfaces.
4. **Pre-Commit Review Gate**: Before any implementation is committed, **both** Security Reviewer and QA Engineer must review and approve. CRITICAL/HIGH findings block the commit.
5. **Sprint-End UAT Review**: UAT Tester reviews ALL completed stories from the user's perspective and submits a Sprint UAT Report. Accessibility Engineer verifies UI stories.
6. **Product Owner Triage**: Product Owner triages UAT findings — **blockers** must be fixed before sprint release, other findings go to backlog.
7. **Retrospective**: Scrum Master facilitates. What worked? What didn't? Improve the process.

### Definition of Done

An issue is done when ALL of the following are true:
- [ ] Architect plan complete (L/XL issues only)
- [ ] Tests written first and passing
- [ ] Implementation complete and TypeScript strict-clean
- [ ] **Security Reviewer approves** (mandatory for ALL implementations — pre-commit gate)
- [ ] **QA Engineer approves** (mandatory for ALL implementations — pre-commit gate)
- [ ] CI pipeline passes
- [ ] Code Reviewer approves (no `any`, no skipped tests, conventions followed)
- [ ] Accessibility Engineer approves (if UI touched)
- [ ] UAT Tester sprint-end review passes (no unresolved blockers)
- [ ] Product Owner triages UAT findings (blockers fixed, others backlogged)
- [ ] Technical Writer updates relevant docs
- [ ] Product Owner accepts

## Key Reference Documents

- `docs/ABLE-CATEGORIES.md` — The 11 IRS-qualified ABLE expense categories
- `docs/SETUP.md` — Self-hosting guide
- `docs/CONTRIBUTING.md` — Contributor guide
- `docs/AI-DEVELOPMENT.md` — How this project demonstrates AI-driven development (backlog)
