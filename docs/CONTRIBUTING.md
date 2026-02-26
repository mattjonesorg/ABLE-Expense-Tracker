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

## Secrets Prevention Hook

This project includes an automated pre-commit hook that scans staged files for secrets and sensitive data before every commit. The hook is configured as a Claude Code PreCommit hook in `.claude/settings.json` and runs `.claude/hooks/check-secrets.sh`.

### What it catches

The hook blocks commits that contain:

- **AWS Access Key IDs** (`AKIA...` pattern)
- **AWS Secret Access Keys** (40-character keys preceded by `secret`, `aws_secret`, etc.)
- **Anthropic API keys** (`sk-ant-...` pattern)
- **Generic secrets** (`api_key`, `password`, `token`, `secret_key`, `private_key` assigned string values)
- **Private keys** (`-----BEGIN RSA PRIVATE KEY-----`, etc.)
- **AWS Account IDs in ARNs** (real 12-digit account IDs in `arn:aws:...` strings)
- **Route53 hosted zone IDs** (e.g., `hostedZoneId = "Z..."`)
- **ACM certificate ARNs** (e.g., `certificateArn = "arn:aws:acm:..."`)
- **Hardcoded AWS account IDs** (`account` variable set to a 12-digit number)

### Known-safe patterns (not blocked)

The hook allows these patterns through without flagging:

- The placeholder AWS account ID `123456789012` (commonly used in docs and tests)
- CDK token references like `${Token[...]}`
- Lines where the variable name contains `mock`, `fake`, `test`, `dummy`, `example`, or `placeholder`
- Values that start with `mock`, `fake`, `test`, `example`, `placeholder`, `changeme`, or `TODO`
- Environment variable references (`process.env.`, `os.environ`, etc.)
- Type definitions and interfaces
- The hook scripts themselves (`.claude/hooks/check-secrets.sh` and `.claude/hooks/test-check-secrets.sh`)
- The `.env.deploy.example` template file (contains empty placeholders, not real values)

### Deployment Configuration

Environment-specific values (AWS account IDs, custom domains, hosted zone IDs, certificate ARNs) are **never committed**. Instead:

1. `.env.deploy.example` is committed as a template showing which values are needed
2. Contributors copy it to `.env.deploy` and fill in their own values
3. `.env.deploy` is in `.gitignore` and will never be committed

This ensures anyone can fork the repo and deploy it to their own AWS account without needing to modify tracked files.

### Handling false positives

If the hook blocks a commit that does not contain a real secret, you can resolve it by:

1. **Move the value to an environment variable** -- this is always the safest option
2. **Use a placeholder value** -- e.g., `123456789012` for AWS account IDs
3. **Add a keyword to the line** -- include `mock`, `fake`, `test`, `example`, or `placeholder` in the variable name or a comment on the same line

### Running the tests

You can verify the hook works correctly by running the test suite:

```bash
bash .claude/hooks/test-check-secrets.sh
```

## Questions?

Open an issue with the `question` label or start a discussion.
