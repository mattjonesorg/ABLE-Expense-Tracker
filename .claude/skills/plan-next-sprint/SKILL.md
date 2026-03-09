# Skill: Plan Next Sprint

## Purpose

Orchestrate a full sprint planning cycle: assess the backlog, select issues, have the architect plan L/XL items, present the sprint plan for user review, and hand off to the Scrum Master to run the sprint using agent teams.

## When to Use

- At the start of each sprint cycle
- When the user wants to plan and kick off the next batch of work

## Procedure

Execute the following phases sequentially. Do NOT skip phases or proceed to the next phase until the current one is complete.

---

### Phase 1: Sprint Number Detection

**Goal:** Determine the sprint number for this planning cycle.

1. If `$ARGUMENTS` is provided and is a number, use that as the sprint number.
2. Otherwise, auto-detect by checking recently closed issues for sprint assignment comments:
   ```bash
   gh issue list --state closed --limit 30 --json number,comments --jq '.[].comments[] | select(.body | test("Sprint: [0-9]+")) | .body' 2>/dev/null | grep -oP 'Sprint: \K[0-9]+' | sort -n | tail -1
   ```
3. If a previous sprint number is found, the next sprint = previous + 1.
4. If no sprint history is found, use `AskUserQuestion` to ask the user: "What sprint number should this be?"

Store the sprint number for use in all subsequent phases.

---

### Phase 2: Backlog Assessment

**Goal:** Select 3-6 issues for the sprint using the Product Owner's prioritization scheme.

Adopt the Product Owner perspective (reference: `.claude/agents/product-owner.md`).

#### Step 2.1: Fetch Issues

```bash
gh issue list --state open --json number,title,labels,assignees,body --limit 50
```

Also fetch recently closed issues to understand current sprint state:
```bash
gh issue list --state closed --limit 20 --json number,title,labels,body
```

#### Step 2.2: Categorize by Priority Tier

Group issues by their `priority:*` label:
- P0: `priority:critical`
- P1: `priority:high`
- P2: `priority:medium`
- P3: `priority:low`
- P4: `priority:backlog`

**Flag any issue without a priority label** — note it for PO triage but do NOT select it.

#### Step 2.3: Check Dependencies

Read each issue body for dependency references:
- "Depends on #X", "Blocked by #X", "Requires #X"
- An issue is **blocked** if any of its dependencies are still open

#### Step 2.4: Filter to Working Tier

Find the highest-priority tier that has unassigned, unblocked issues. This is the working tier. If all issues in the working tier are selected and capacity remains, move to the next tier.

#### Step 2.5: Score Candidates

For each unblocked, unassigned issue in the working tier:

```
Score = (User_Impact x Dev_Story_Impact x Dependency_Weight) / Effort
```

- **User_Impact** (1-5): Value to ABLE account managers
- **Dev_Story_Impact** (1-5): Demonstrates AI-driven development practices
- **Dependency_Weight**: 2.0 if it unblocks other issues; 1.0 if independent; 0.5 if blocked by other work
- **Effort** (1-5): Use size labels if present (XS=1, S=2, M=3, L=4, XL=5), otherwise estimate from description

#### Step 2.6: Select Issues

1. Pick highest-scoring issues from the working tier
2. Determine the implementing agent for each:
   - `web/` changes → Frontend Engineer
   - `api/` changes → Backend Engineer
   - `infra/` or `.github/` changes → DevOps Engineer
   - Documentation → Technical Writer
   - Test strategy/coverage → QA Engineer
   - Accessibility → Accessibility Engineer
   - Multiple domains → assign primary agent, note collaborators
3. **Balance across agents** — don't assign 3 issues to one agent when others are idle
4. **Respect WIP limits** — no agent gets more than 2 issues
5. Select 3-6 issues total (stop when agents are loaded or no eligible issues remain)

---

### Phase 3: Architecture Planning

**Goal:** Produce implementation plans for L/XL issues.

For each selected issue with size L or XL:

1. Spawn a `Plan` agent with the following prompt:
   ```
   You are the Senior Architect for ABLE Tracker. Read `.claude/agents/senior-architect.md` for your full role definition.

   Produce an implementation plan for issue #[NUMBER]: [TITLE]

   Issue body:
   [ISSUE BODY]

   Your plan must include:
   1. Architecture overview — how the feature fits into the existing system
   2. Component breakdown — new files, modules, or changes needed
   3. API contracts — request/response shapes, endpoint paths, status codes
   4. Data model changes — DynamoDB key schemas, GSI updates, new access patterns
   5. Test strategy — what tests to write first (TDD), key edge cases, integration boundaries
   6. Dependency order — what to build first, what can be parallelized
   7. Security considerations — auth requirements, input validation, data exposure risks

   Reference the existing codebase structure:
   - Frontend: web/src/ (React + Vite + Mantine v7)
   - Backend: api/src/ (Lambda + DynamoDB)
   - Infrastructure: infra/ (CDK)
   - Shared types in each package's src/lib/types.ts
   ```

2. Collect the plan output.

For S/M issues: note the implementing agent and a brief 1-2 sentence approach (no full architect plan needed).

---

### Phase 4: Sprint Plan Review

**Goal:** Present the sprint plan to the user for review and approval.

Present the following formatted output:

```markdown
## Sprint [N] Plan

### Sprint Goal
[One-sentence goal summarizing what this sprint delivers — cover both practical value and AI-dev story value]

### Selected Issues

| # | Title | Priority | Score | Size | Agent | Notes |
|---|-------|----------|-------|------|-------|-------|
| [number] | [title] | [tier] | [score] | [size] | [agent] | [brief note] |

### Dependency Order
[Which issues must complete before others can start, or "No dependencies — all issues can be worked in parallel"]

### Architecture Plans
[For each L/XL issue, include the full architect plan from Phase 3]

### S/M Issue Approaches
[For each S/M issue, 1-2 sentence approach and implementing agent]

### Risks & Notes
- [Any blocking risks, missing info, agent capacity concerns]
- [Issues flagged for PO triage (missing priority labels)]
```

Then use `AskUserQuestion` to ask:
- "Do you approve this sprint plan?" with options:
  - "Approve — start the sprint"
  - "Modify — I want to change something" (if selected, ask what to change and iterate)
  - "Cancel — don't start a sprint right now"

If the user approves, proceed to Phase 5. If they want modifications, adjust the plan and re-present. If they cancel, stop.

---

### Phase 5: Handoff to Scrum Master

**Goal:** Create the agent team and hand off to the Scrum Master to orchestrate implementation.

**IMPORTANT:** Only the team lead can spawn agents. The Scrum Master CANNOT spawn subagents. The team lead must spawn ALL agents (SM + implementing agents) in this phase.

#### Step 5.1: Create Team

Use `TeamCreate` with:
- `team_name`: `"sprint-[N]"` (e.g., `"sprint-7"`)
- `description`: `"Sprint [N]: [sprint goal]"`

#### Step 5.2: Create Tasks

Use `TaskCreate` for each approved issue. Each task should include:
- `subject`: `"#[number] — [title]"`
- `description`: Include:
  - Issue number and link
  - Acceptance criteria from the issue body
  - Architect plan (if L/XL)
  - Assigned agent name
  - Branch name to use: `<type>/<issue-number>-<short-description>`

Set up `blockedBy` dependencies between tasks using `TaskUpdate` where needed.

#### Step 5.3: Label Issues

For each selected issue, add the in-progress label and a sprint assignment comment:
```bash
gh issue edit [number] --add-label "status:in-progress"
gh issue comment [number] --body "Assigned to: [Agent Name] | Sprint: [N] | Score: [X.X]"
```

#### Step 5.4: Spawn Scrum Master

Use the `Agent` tool with:
- `team_name`: `"sprint-[N]"`
- `name`: `"scrum-master"`
- `subagent_type`: `"general-purpose"`

Prompt the SM with the full sprint plan and tell it to monitor progress, coordinate agents, and handle blockers. Remind it that it does NOT implement code and does NOT spawn agents — the team lead handles spawning.

#### Step 5.5: Spawn All Implementing Agents

Spawn ALL implementing agents in a single message (parallel). For each agent, use the `Agent` tool with:
- `team_name`: `"sprint-[N]"`
- `name`: `"[agent-name]"` (e.g., "frontend-engineer", "backend-engineer")
- `subagent_type`: `"general-purpose"`
- `isolation`: `"worktree"` — so each agent works in an isolated git worktree

**CRITICAL — Worktree instructions for every agent prompt:**

Include this block verbatim in every implementing agent's prompt:

```
**Worktree Environment:** You are running in an isolated git worktree — a separate
copy of the repository just for you. Your working directory is already set to your
worktree root. No other agent shares this directory.
- Run `pwd` first to confirm your working directory
- Create your feature branch here: `git checkout -b <branch-name>`
- Do ALL work in this directory — do NOT cd to the main repository or other worktrees
- Your worktree is independent — commit, push, and create PRs from here
```

Additionally, each agent prompt MUST include the **Mandatory Pre-PR Checklist** below. This is not optional — agents must complete every step before creating a PR.

**Mandatory Pre-PR Checklist — include verbatim in every agent prompt:**

```
## Mandatory Pre-PR Checklist

Before creating a PR, you MUST complete ALL of the following steps in order.
Do NOT skip any step. Do NOT create a PR until every step passes.

1. Run all tests and confirm they pass:
   pnpm -r run test

2. Rebase onto the latest main to avoid stale-branch issues:
   git fetch origin main && git rebase origin/main

3. If the rebase produces conflicts, resolve them and run tests again.

4. Verify your branch contains ONLY your commits:
   git log --oneline main..HEAD
   If you see commits that are not yours, STOP and investigate.

5. Create the PR:
   gh pr create --title "<title>" --body "<body referencing issue #NUMBER>"
```

Each agent prompt should also include:
- Tell them to read their persona file: `.claude/agents/[agent-name].md`
- Give them their assigned task(s) with full details and acceptance criteria
- Include the architect plan if the task is L/XL
- Remind them: "Follow TDD — write tests BEFORE implementation"
- Remind them: "Use branch name: `<type>/<issue-number>-<short-description>`"
- Remind them: "When done, mark your task as completed using TaskUpdate"

---

## Output Format

When the skill completes Phase 5, output:

```markdown
## Sprint [N] Launched

**Goal**: [sprint goal]
**Issues**: [count] issues assigned to [count] agents
**Team**: sprint-[N] created with Scrum Master as lead

The Scrum Master is now orchestrating the sprint. You can:
- Check progress: ask "How is sprint [N] going?"
- Message the SM: the team will send you updates as work completes
- View tasks: check ~/.claude/tasks/sprint-[N]/
```

## Error Handling

- **No open issues**: Report "Backlog is empty — no issues to plan" and stop.
- **All issues are blocked**: Report the blocking chain and ask the user how to proceed.
- **No priority labels on any issues**: Flag all issues for PO triage and stop.
- **gh CLI not authenticated**: Prompt user to run `gh auth login`.
- **User cancels during review**: Stop gracefully, do not create team or label issues.
