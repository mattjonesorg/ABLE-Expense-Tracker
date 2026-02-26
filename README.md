# ABLE Tracker

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Open-source expense tracking for ABLE account authorized representatives.**

ABLE Tracker is a progressive web app (PWA) for tracking qualified ABLE account expenses and managing reimbursements. It's built for families and authorized representatives who manage [ABLE accounts](https://www.ablenrc.org/) on behalf of people with disabilities.

## Dual Purpose

This project serves two goals:

1. **A practical tool** — Track expenses across all 11 IRS-qualified categories, attach receipts, get AI-assisted categorization, and generate reimbursement summaries.
2. **A reference implementation** — Demonstrate AI-driven software development with rigorous engineering guardrails (TDD, CI/CD, strict TypeScript, tested infrastructure).

## Built with AI

This project was built using [Claude Code](https://claude.com/claude-code) with a team of 12 specialized AI agents. The engineering guardrails aren't afterthoughts — they're the foundation:

- **Test-Driven Development** — Tests are written before implementation, always
- **Strict TypeScript** — No `any` types, full type safety across the stack
- **CI/CD** — Every pull request is built, tested, and reviewed before merge
- **Tested Infrastructure** — CDK stacks have assertion-based tests, not just deployment scripts

This demonstrates that AI-assisted development and disciplined engineering are complementary. The AI moves fast; the guardrails keep it correct.

## Accessibility

This app serves people managing accounts for individuals with disabilities. **Accessibility is core to the mission, not an afterthought.**

- WCAG 2.1 AA compliance is a project requirement
- All components are tested for keyboard navigation and screen reader support
- Color contrast, focus management, and semantic HTML are enforced throughout
- The Accessibility Engineer agent reviews every UI change

## Quick Start

```bash
corepack enable
pnpm install
pnpm test
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React PWA, Mantine v7, React Router |
| Backend | AWS Lambda (Node.js), API Gateway |
| Database | DynamoDB (single-table design) |
| Storage | S3 (receipt uploads) |
| Auth | Cognito (email + social login) |
| AI | Claude API (expense categorization) |
| Infrastructure | AWS CDK (TypeScript) |
| CI/CD | GitHub Actions |
| Testing | Vitest, React Testing Library, CDK Assertions |

## Agent Team

Development is guided by 12 specialized AI agents, each with a defined role and set of responsibilities:

| Agent | Role |
|---|---|
| Scrum Master | Sprint planning, backlog management, workflow coordination |
| Product Owner | Requirements, acceptance criteria, prioritization |
| Senior Architect | System design, technical decisions, integration patterns |
| Frontend Engineer | React components, state management, UI implementation |
| Backend Engineer | Lambda handlers, DynamoDB access, API logic |
| DevOps Engineer | CDK infrastructure, CI/CD pipelines, deployment |
| QA Engineer | Test strategy, test implementation, coverage analysis |
| UAT Tester | User acceptance testing, scenario validation |
| Security Reviewer | Auth flows, input validation, dependency auditing |
| Technical Writer | Documentation, API docs, user guides |
| Code Reviewer | Code quality, patterns, PR reviews |
| Accessibility Engineer | WCAG compliance, screen reader testing, keyboard navigation |

Agent definitions live in [`.claude/agents/`](.claude/agents/).

## Documentation

- [Self-Hosting Setup Guide](docs/SETUP.md)
- [Contributing Guide](docs/CONTRIBUTING.md)
- [ABLE Expense Categories Reference](docs/ABLE-CATEGORIES.md)

## License

[MIT](LICENSE)
