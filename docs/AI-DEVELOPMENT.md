# AI-Driven Development: How ABLE Tracker Was Built

ABLE Tracker was built almost entirely by AI agents using [Claude Code](https://claude.com/claude-code). This document explains the engineering practices that made that work, with concrete examples from the codebase.

The central thesis: **AI coding assistants and disciplined engineering practices are complementary, not contradictory.** The faster AI moves, the more guardrails matter. Every constraint described here exists because, without it, AI-generated code drifted in ways that caused real problems.

## Table of Contents

1. [Introduction](#introduction)
2. [TDD as Automated Reviewer](#tdd-as-automated-reviewer)
3. [CI/CD as Safety Net](#cicd-as-safety-net)
4. [Strict TypeScript as Constraint](#strict-typescript-as-constraint)
5. [CDK Tests for Infrastructure](#cdk-tests-for-infrastructure)
6. [Agent Team Workflow](#agent-team-workflow)
7. [Pre-Commit Review Gates](#pre-commit-review-gates)
8. [Skills Automation](#skills-automation)
9. [What Worked and What Didn't](#what-worked-and-what-didnt)
10. [Lessons Learned](#lessons-learned)

---

## Introduction

ABLE Tracker is a progressive web app for tracking qualified [ABLE account](https://www.ablenrc.org/) expenses. It serves families and authorized representatives who manage ABLE accounts on behalf of people with disabilities.

The project has a dual purpose:

1. **Practical utility** -- Fill a real gap in ABLE account management tooling. No good open-source option existed for tracking expenses across the 11 IRS-qualified categories, managing receipt uploads, or calculating reimbursements.

2. **Reference implementation** -- Demonstrate that AI-driven development, done with rigorous engineering guardrails, produces production-quality software. Not a toy demo. A real application with authentication, a database, file uploads, and an AI integration, all tested, deployed, and maintained by AI agents.

Over 6 sprints and 150+ commits, a team of 12 specialized AI agents built the full stack: React PWA frontend, AWS Lambda API, DynamoDB database, S3 file storage, Cognito authentication, CDK infrastructure, CI/CD pipelines, and automated security reviews. Every line of production code was written by an AI agent. Every line was also reviewed by AI agents acting as Security Reviewer and QA Engineer before it was committed.

The rest of this document explains the practices that made this possible.

---

## TDD as Automated Reviewer

Test-Driven Development is the single most important practice for AI-driven development. When an AI agent writes code, tests are the automated reviewer that tells it whether the code is correct.

### How it works

Every implementing agent follows the same cycle:

1. **Read the acceptance criteria** from the GitHub issue
2. **Write tests first** that encode those criteria as executable assertions
3. **Run the tests** -- they fail (red)
4. **Write the implementation** to make them pass (green)
5. **Refactor** if needed, re-running tests to confirm nothing broke

Tests define the contract. The AI is not guessing at requirements; it is writing code that satisfies a specific, machine-verifiable specification.

### Project structure

Test files mirror the source structure:

```
api/
  src/handlers/expenses/create.ts
  test/handlers/expenses/create.test.ts

web/
  src/pages/ExpenseForm.tsx
  test/pages/ExpenseForm.test.tsx
```

Coverage targets are enforced: **80% line coverage for `api/`**, **70% for `web/`**.

The backend has 12 test files covering handlers, middleware, and library code. The frontend has 17 test files covering pages, components, libraries, and accessibility. Infrastructure has 5 test files covering every CDK stack.

### Concrete example

The expense creation handler (`api/test/handlers/expenses/create.test.ts`) tests against typed mock contexts and validates specific behaviors:

```typescript
const mockAuthContext: AuthContext = {
  userId: 'user-alice-sub',
  accountId: 'acct_01HXYZ',
  email: 'alice@example.com',
  displayName: 'Alice Smith',
  role: 'owner',
};
```

Tests verify not just happy paths but edge cases: missing fields, invalid amounts, unauthorized access. The implementation has to satisfy all of them before the agent can move on.

### Why it matters for AI

Without TDD, an AI agent will write code that looks correct but has subtle issues -- wrong return types, missing edge cases, incorrect business logic. The tests catch these immediately, in the same session, before the code is committed. The AI gets instant feedback and fixes the problem.

---

## CI/CD as Safety Net

GitHub Actions runs on every pull request and every push to main. This catches problems that slip past local testing.

### Pipeline overview

The project uses seven workflows in `.github/workflows/`:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `test.yml` | PR + push to main | Build, lint, run all unit tests |
| `security-review.yml` | Every PR | AI-powered security review of the diff |
| `deploy-infra.yml` | Push to main (infra/ or api/ changes) | CDK deploy to AWS |
| `deploy-frontend.yml` | Push to main (web/ changes) | Build and deploy to S3 + CloudFront |
| `smoke-test.yml` | After infra/frontend deploy | Hit live endpoints with real auth |
| `e2e.yml` | Manual trigger | Playwright browser tests against deployed app |
| `claude.yml` | GitHub issue assignment | Claude Code agent automation |

### Key design decisions

**The test workflow validates Claude Code hook format.** After agents broke the `.claude/settings.json` hook format twice (using a flat structure instead of the required nested `hooks` array), a validation step was added to CI:

```yaml
- name: Validate Claude Code hooks format
  run: node scripts/validate-hooks.mjs
```

This is a pattern worth noting: **when AI agents make the same mistake twice, add an automated check.** Don't rely on instructions alone.

**Smoke tests authenticate against real Cognito and hit the live API.** After deployment, the smoke test workflow obtains a real JWT token and calls every endpoint. This catches deployment configuration issues that unit tests cannot, like missing environment variables or incorrect IAM permissions.

**The security review workflow uses Claude to review every PR diff.** It checks for unauthenticated endpoints, hardcoded secrets, IDOR vulnerabilities, overly permissive IAM policies, and OWASP top 10 issues. CRITICAL/HIGH findings fail the workflow and block the merge.

---

## Strict TypeScript as Constraint

Every `tsconfig.json` in the project sets `"strict": true`. This is non-negotiable.

### What strict mode enforces

- No implicit `any` -- every variable must have a known type
- Strict null checks -- cannot access `.property` on a value that might be `undefined`
- Strict function types -- callback parameter types must match exactly
- No unused locals or parameters

### Project rules on top of strict mode

- **No `any` types.** Use `unknown` and narrow with type guards.
- **No `@ts-ignore` or `@ts-expect-error`** without a comment explaining why.
- **Shared types live in `src/lib/types.ts`** in each package. This creates a single source of truth for data shapes.
- **Money values are integers (cents).** Never floating-point. This is a type-level constraint: the `Expense` type uses `amount: number` representing cents.

### Why it matters for AI

AI-generated TypeScript without strict mode tends to accumulate `any` types. Each `any` is a hole in the type system where bugs hide. Strict mode forces the AI to think about types explicitly, which produces more correct code.

When the AI writes `const data: any = await response.json()`, the QA Engineer review hook catches it and blocks the commit. The AI must instead write a proper type guard or use a typed response.

---

## CDK Tests for Infrastructure

Infrastructure-as-Code without tests is just infrastructure-as-YAML-you-hope-is-right. CDK assertion tests verify that synthesized CloudFormation templates contain exactly the resources and configurations expected.

### Test structure

Infrastructure tests live in `infra/test/` with one test file per stack:

```
infra/test/
  api-stack.test.ts      -- API Gateway, Lambda, IAM
  auth-stack.test.ts     -- Cognito User Pool
  data-stack.test.ts     -- DynamoDB, S3
  hosting-stack.test.ts  -- CloudFront, S3 website
  stacks.test.ts         -- cross-stack integration
```

### What they verify

The `api-stack.test.ts` file is the most thorough example. It tests:

**Resource counts** -- exactly 7 Lambda functions, 7 API routes, 1 JWT authorizer:

```typescript
it('creates Lambda functions for all 7 endpoints', () => {
  template.resourceCountIs('AWS::Lambda::Function', 7);
});
```

**Security configuration** -- JWT auth on every route, no wildcard CORS:

```typescript
it('does not allow wildcard (*) CORS origins', () => {
  template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
    CorsConfiguration: {
      AllowOrigins: Match.not(Match.arrayWith(['*'])),
    },
  });
});
```

**Least-privilege IAM** -- each Lambda gets only the permissions it needs:

```typescript
it('ListExpenses gets DynamoDB read-only access (no write)', () => {
  const stmts = getPolicyStatementsForFunction(template, 'List all expenses');
  expect(statementsHaveDynamoRead(stmts)).toBe(true);
  expect(statementsHaveDynamoWrite(stmts)).toBe(false);
});

it('CategorizeExpense gets NO DynamoDB access', () => {
  const stmts = getPolicyStatementsForFunction(
    template, 'AI-assisted expense categorization'
  );
  expect(statementsHaveAnyDynamo(stmts)).toBe(false);
});
```

**S3 access scoping** -- upload Lambda can only write to the `receipts/*` prefix:

```typescript
it('RequestUploadUrl S3 access is scoped to receipts/* prefix', () => {
  // ... verifies no full-bucket wildcard access
  const hasScopedResource = allResources.some((r) => r.includes('receipts/*'));
  expect(hasScopedResource).toBe(true);
});
```

**API Gateway throttling** -- rate limiting on all endpoints, with stricter limits on the AI categorization endpoint:

```typescript
it('configures stricter rate limit of 10 requests/second for POST /expenses/categorize', () => {
  template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
    RouteSettings: Match.objectLike({
      'POST /expenses/categorize': Match.objectLike({
        ThrottlingRateLimit: 10,
      }),
    }),
  });
});
```

### Why it matters for AI

AI agents adding new Lambda functions or modifying IAM policies will immediately see test failures if they accidentally grant too-broad permissions. The test for "CategorizeExpense gets NO DynamoDB access" is a real example: an AI agent might reasonably think the categorization endpoint needs database access, but the test enforces the architectural decision that it should not.

---

## Agent Team Workflow

Development is coordinated by 12 specialized AI agents, each with a defined persona, responsibilities, and owned areas of the codebase. Agent definitions live in `.claude/agents/`.

### The team

| Agent | Primary Responsibility |
|-------|----------------------|
| Scrum Master | Sprint planning, agent coordination, workflow |
| Product Owner | Backlog prioritization, acceptance criteria |
| Senior Architect | System design for L/XL features (plans, does not implement) |
| Frontend Engineer | React PWA, Mantine UI components |
| Backend Engineer | Lambda handlers, DynamoDB, Claude API integration |
| DevOps Engineer | CDK infrastructure, CI/CD pipelines |
| QA Engineer | Test strategy, coverage, pre-commit review gate |
| UAT Tester | User acceptance testing, demo scripts with screenshots |
| Security Reviewer | Auth, data protection, IAM, pre-commit review gate |
| Technical Writer | Documentation quality and completeness |
| Code Reviewer | Engineering standards enforcement |
| Accessibility Engineer | WCAG compliance, keyboard navigation, screen readers |

### Sprint cycle

Each sprint follows a defined workflow:

1. **Sprint Planning** -- The `plan-next-sprint` skill automates backlog assessment, issue scoring, architect planning, and team orchestration (see [Skills Automation](#skills-automation)).

2. **Architecture Planning** -- For L/XL issues, the Senior Architect produces an implementation plan covering API contracts, data model changes, test strategy, and dependency order. The Architect plans but never implements.

3. **Development** -- Implementing agents (Frontend, Backend, DevOps) work in isolated git worktrees so they can run in parallel without conflicts. Each agent follows TDD.

4. **Pre-Commit Review Gate** -- Before any implementation is committed, both the Security Reviewer and QA Engineer automatically review the changes (see [Pre-Commit Review Gates](#pre-commit-review-gates)).

5. **Sprint-End UAT** -- The UAT Tester reviews all completed stories, captures screenshots with Playwright, and updates the product demo script. The Accessibility Engineer verifies UI changes.

6. **Product Owner Triage** -- UAT findings are triaged: blockers must be fixed before release, everything else goes to the backlog.

### Isolation model

Each implementing agent works in its own git worktree, created via Claude Code's `isolation: "worktree"` parameter. This means:

- Agents can edit different files simultaneously without merge conflicts
- Each agent has its own working directory and can run tests independently
- When done, each agent creates a PR from its branch
- The Scrum Master coordinates but never implements code directly

---

## Pre-Commit Review Gates

Every agent's work is automatically reviewed before it can be committed. This is enforced through Claude Code's `SubagentStop` hooks in `.claude/settings.json`.

### How it works

When any implementing agent finishes its work and attempts to stop, two review agents run automatically:

**Security Reviewer** checks for:
- API endpoints accessible without authentication
- Hardcoded secrets or credentials
- IDOR/cross-account data access
- Overly permissive IAM policies
- PII exposure, XSS, injection vulnerabilities

**QA Engineer** checks for:
- Missing tests for new code (TDD enforcement)
- Skipped or disabled tests
- `any` types in TypeScript
- Weak test assertions (e.g., just `toBeTruthy()`)
- `@ts-ignore` without explanatory comments
- Floating-point money values

### Hook configuration

The hooks are defined in `.claude/settings.json` using the nested format:

```json
{
  "hooks": {
    "SubagentStop": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "agent",
            "prompt": "Review the changes for security issues...",
            "model": "claude-sonnet-4-6",
            "statusMessage": "Security review..."
          },
          {
            "type": "agent",
            "prompt": "Review the changes for QA/engineering quality...",
            "model": "claude-sonnet-4-6",
            "statusMessage": "QA review..."
          }
        ]
      }
    ]
  }
}
```

CRITICAL or HIGH findings block the commit. The implementing agent must fix the issues before proceeding.

### Secret scanning

A separate `PreToolUse` hook runs on every `Write` or `Edit` operation. The script at `.claude/hooks/check-secrets-pretooluse.sh` scans content for:

- AWS access key IDs (`AKIA...`)
- AWS secret access keys
- Anthropic API keys (`sk-ant-...`)
- Private keys (PEM format)
- Hardcoded AWS account IDs in ARNs
- Generic secrets assigned to variables

This runs before the file is written, preventing secrets from ever reaching disk. Smart exclusions skip test fixtures, mock values, and CDK token references.

### Defense in depth

The project has three layers of security review:

1. **PreToolUse hook** -- Blocks secrets from being written to files in real-time
2. **SubagentStop hook** -- Security Reviewer and QA Engineer review all changes before commit
3. **CI workflow** -- `security-review.yml` uses Claude to review every PR diff, blocking merges on CRITICAL/HIGH findings

---

## Skills Automation

Skills are reusable, multi-phase procedures defined in `.claude/skills/`. They encode complex workflows that would otherwise require manual coordination.

### plan-next-sprint

**Location:** `.claude/skills/plan-next-sprint/SKILL.md`

This skill automates the entire sprint planning cycle across 5 phases:

1. **Sprint Number Detection** -- Auto-detects the next sprint number from GitHub issue comments
2. **Backlog Assessment** -- Fetches open issues, categorizes by priority tier, checks dependencies, scores candidates using the formula: `Score = (User_Impact x Dev_Story_Impact x Dependency_Weight) / Effort`
3. **Architecture Planning** -- Spawns a `Plan` agent for L/XL issues to produce implementation plans covering API contracts, data models, test strategy, and dependency order
4. **Sprint Plan Review** -- Presents the plan to the user for approval with an interactive prompt (approve, modify, or cancel)
5. **Handoff to Scrum Master** -- Creates the agent team, assigns tasks, labels issues in GitHub, and spawns the Scrum Master to orchestrate implementation

This turns sprint planning from a multi-hour manual coordination exercise into a single command that produces a scored, dependency-aware, architect-reviewed sprint plan.

### build-demo-script

**Location:** `.claude/skills/build-demo-script/SKILL.md`

This skill refreshes the product demo documentation at the end of each sprint:

1. **QA Engineer** captures screenshots using Playwright (supports both local dev and deployed environments)
2. **UAT Tester** updates `docs/demos/product-demo.md` with accurate descriptions, screenshot references, and verification checklists
3. **Product Owner** triages any discrepancies -- blockers stop the release, minor issues go to the backlog

The capture scripts (`docs/demos/capture-local-screenshots.mjs` and `docs/demos/capture-screenshots.mjs`) are extensible: adding a new screenshot block follows a documented pattern in the skill definition.

### choose-next-issue

**Location:** `.claude/skills/choose-next-issue/SKILL.md`

Uses the same prioritization scheme as the Product Owner to select the next issue from the backlog. This ensures consistent priority ordering regardless of which agent or human triggers issue selection. It scores issues using the same formula, respects dependency chains, and balances work across agents.

---

## What Worked and What Didn't

### What worked

**TDD caught real bugs immediately.** When the Backend Engineer implemented the categorize handler, the pre-written tests caught that the response property was named `CategoryResult` instead of `categoryResult` (commit `8082e6d`). Without the test, this would have been a production bug discovered by a user.

**SubagentStop hooks prevented security issues from shipping.** The Security Reviewer hook caught missing auth checks, overly broad IAM policies, and CORS misconfigurations before they reached a PR. The dedicated security audit (PR #118) then hardened what was already a reasonably secure codebase.

**CDK tests prevented infrastructure drift.** When an agent modified the API stack, the least-privilege IAM tests immediately flagged if a Lambda was granted broader permissions than intended. The test `'CategorizeExpense gets NO DynamoDB access'` is a good example -- the categorization endpoint calls the Claude API and has no business reading the database.

**Git worktree isolation enabled parallel development.** Multiple agents could work on different issues simultaneously without stepping on each other's changes. This was essential for sprint velocity.

**The hooks format validation in CI** (`scripts/validate-hooks.mjs`) was added after agents broke `.claude/settings.json` twice by using a flat format instead of the nested array format. This is a meta-lesson: when AI makes the same mistake twice, automate the check.

**Automated sprint planning** via the `plan-next-sprint` skill turned a complex multi-step process into a single command. The scoring formula ensured consistent prioritization across 6 sprints and 40+ merged PRs.

### What didn't work (or was harder than expected)

**AI agents sometimes "improved" code beyond what was asked.** An agent asked to fix a bug might also refactor surrounding code, add comments, or introduce abstractions. This made PRs harder to review and occasionally introduced new issues. The solution was explicit instructions in CLAUDE.md: "Only make changes that are directly requested or clearly necessary."

**Cross-agent coordination required careful prompt engineering.** Early sprints had issues where agents duplicated work or made conflicting assumptions about shared interfaces. Defining clear API contracts in architect plans before implementation began was the fix.

**Hook format was fragile.** The `.claude/settings.json` format has a nested structure that is not intuitive. Agents defaulted to a flat format that looked right but failed silently. This was solved by documenting the exact format in CLAUDE.md and adding CI validation.

**Accessibility required human judgment.** While the Accessibility Engineer agent could check for programmatic issues (missing ARIA labels, insufficient contrast ratios), nuanced UX decisions about focus management and screen reader flow benefited from the axe-core automated scanning added in Sprint 6.

**Secret scanning had false positives.** The PreToolUse hook initially flagged CDK token references (`${Token[...]}`) as secrets. The script needed explicit exclusions for CDK tokens, test fixtures, and mock values. Getting the balance right between too-strict (blocking legitimate code) and too-loose (missing real secrets) took iteration.

---

## Lessons Learned

### 1. Guardrails are the feature

The natural instinct is to view TDD, strict TypeScript, and review gates as overhead that slows AI down. The opposite is true. These constraints are what make AI output trustworthy. Without them, you spend more time reviewing and fixing AI-generated code than you saved by using AI in the first place.

### 2. Encode decisions in tests, not just documents

Architectural decisions like "the categorization Lambda must not access DynamoDB" are easy to forget. A test makes the decision executable and permanent. When a future agent violates the decision, the test fails immediately with a clear message.

### 3. Automate the things AI gets wrong repeatedly

If an AI agent makes the same mistake twice, add a CI check, a hook, or a validation script. Instructions in CLAUDE.md help, but automated enforcement is better. The hooks format validator is a real example of this principle.

### 4. Separate planning from implementation

The Senior Architect plans L/XL features but never implements them. This prevents the common failure mode where an AI agent starts coding before fully thinking through the design. The architect produces API contracts, data models, and test strategies. The implementing agents follow the plan.

### 5. Pre-commit review gates are essential, not optional

Relying on PR reviews alone means issues are caught after the agent has finished and moved on. SubagentStop hooks catch issues while the implementing agent is still active and can fix them immediately. This is faster and produces cleaner commits.

### 6. AI works best with clear, bounded tasks

The highest-quality output came from well-scoped issues with clear acceptance criteria. Vague issues like "improve the UI" produced inconsistent results. Issues like "add reimbursement status filter to Expense List page with dropdown for All/Unreimbursed/Reimbursed" produced exactly what was specified.

### 7. Defense in depth works for AI just like it works for security

Three layers of security review (PreToolUse secret scanning, SubagentStop review, CI security workflow) might seem redundant. Each layer catches different things. The PreToolUse hook catches secrets in real-time. SubagentStop catches architectural security issues. CI catches issues across the full PR diff. No single layer is sufficient.

### 8. The AI development story is the product story

Every engineering practice described here -- TDD, CI/CD, typed infrastructure, automated reviews -- is a practice that human teams benefit from too. The difference is that with AI, these practices go from "nice to have" to "essential." That makes the project a better reference implementation, because the guardrails that make AI reliable also make human development more reliable.

---

## Getting Started

If you want to explore the patterns described here:

- **Tests**: Browse `api/test/` and `web/test/` for examples of TDD patterns
- **CDK tests**: See `infra/test/api-stack.test.ts` for infrastructure assertion examples
- **Agent definitions**: Read `.claude/agents/` for the 12 agent personas
- **Hook configuration**: See `.claude/settings.json` for the review gate setup
- **Skills**: Check `.claude/skills/` for automated workflow definitions
- **CI/CD**: Review `.github/workflows/` for the full pipeline

For setting up your own instance, see the [Self-Hosting Guide](SETUP.md). For contributing, see the [Contributing Guide](CONTRIBUTING.md).
