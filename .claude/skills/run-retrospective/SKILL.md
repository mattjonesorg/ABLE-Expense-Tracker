# Skill: Run Retrospective

## Purpose

Automate the sprint retrospective ceremony: gather sprint data, analyze patterns from agent issues, propose concrete improvements, and create GitHub issues for approved changes.

## When to Use

- At the end of each sprint, after all work is complete
- When the Scrum Master wants to run a retrospective
- When the team wants to identify and address process issues from a sprint

## Procedure

Execute the following phases sequentially. Do NOT skip phases or proceed to the next phase until the current one is complete.

---

### Phase 1: Gather Sprint Data

**Goal:** Collect all relevant data from the sprint.

#### Step 1.1: Determine Sprint Number

1. If `$ARGUMENTS` is provided and is a number, use that as the sprint number.
2. Otherwise, auto-detect by checking recently closed issues for sprint assignment comments:
   ```bash
   gh issue list --state closed --limit 30 --json number,comments --jq '.[].comments[] | select(.body | test("Sprint: [0-9]+")) | .body' 2>/dev/null | grep -oP 'Sprint: \K[0-9]+' | sort -n | tail -1
   ```
3. If a previous sprint number is found, use that as the current sprint.
4. If no sprint history is found, use `AskUserQuestion` to ask: "What sprint number is this retrospective for?"

#### Step 1.2: Fetch Completed Issues

```bash
# Get closed issues that were in this sprint
gh issue list --state closed --limit 50 --json number,title,labels,body,comments \
  --jq '[.[] | select(.comments[]?.body | test("Sprint: '"$SPRINT_NUMBER"'"))]'
```

#### Step 1.3: Fetch Open PRs from This Sprint

```bash
gh pr list --state all --limit 50 --json number,title,state,body,comments,reviews
```

#### Step 1.4: Gather the Scrum Master's Issue Log

The Scrum Master maintains an issue log during the sprint (see `.claude/agents/scrum-master.md`, "Issue Tracking During Sprint" section). This log tracks agent issues encountered during the sprint.

1. Check if the Scrum Master's sprint summary or issue log has been provided in the conversation context.
2. If not available, use `AskUserQuestion` to ask:
   "Please paste the Scrum Master's sprint issue log (or point me to where it is). This is the log of agent issues encountered during the sprint — worktree confusion, tooling gaps, prompt misunderstandings, etc."

---

### Phase 2: Analyze Patterns

**Goal:** Identify recurring patterns in the sprint's issues and classify them.

#### Step 2.1: Categorize Issues

Group each issue from the Scrum Master's log into one of these categories:

| Category | Description | Examples |
|----------|-------------|----------|
| `worktree-confusion` | Agent worked in the wrong directory or confused worktree paths | cd to main repo, wrong working directory |
| `tooling-gap` | Missing tool, script, or automation that would have prevented the issue | No lint script, missing test helper |
| `prompt-misunderstanding` | Agent misinterpreted instructions from its persona or skill file | Wrong file format, skipped a required step |
| `dependency-conflict` | Package version issue, lock file conflict, or missing dependency | pnpm install failure, version mismatch |
| `test-failure` | Test that failed unexpectedly or was written incorrectly | Flaky test, wrong assertion, missing mock |
| `ci-failure` | CI pipeline failure not caused by test code | GitHub Actions config, timeout, env var |
| `hook-misconfiguration` | Claude Code hook format or execution issue | Wrong hook schema, hook script error |
| `scope-creep` | Agent did more or less work than assigned | Added unrequested features, missed requirements |
| `coordination-failure` | Handoff or communication issue between agents | Duplicate work, missed dependency, merge conflict |
| `other` | Doesn't fit the above categories | Describe in detail |

#### Step 2.2: Count Frequency

For each category, count:
- Number of occurrences
- Which agents were affected
- Severity: **blocking** (stopped work), **slowing** (required workaround), or **confusing** (caused delay but self-resolved)

#### Step 2.3: Identify Top Patterns

Sort categories by impact (blocking > slowing > confusing, then by frequency). The top 3-5 patterns are the focus for improvement proposals.

---

### Phase 3: Propose Improvements

**Goal:** For each top pattern, propose a concrete, actionable improvement.

For each pattern identified in Phase 2, produce a proposal with:

- **Problem**: What went wrong, with specific examples from the sprint
- **Proposed Fix**: The specific change to make. Must be one of:
  - Agent persona update (`.claude/agents/*.md`)
  - Skill update (`.claude/skills/*/SKILL.md`)
  - New or updated hook (`.claude/settings.json`, `.claude/hooks/`)
  - Documentation update (`CLAUDE.md`, memory files)
  - New automation or tooling (scripts, CI config)
  - Process change to the sprint workflow
- **Files to Change**: Exact file paths that would be modified
- **Priority**: Score using the project's formula:
  ```
  Score = (User_Impact x Dev_Story_Impact x Dependency_Weight) / Effort
  ```
  - User_Impact: How much this improves agent reliability (1-5)
  - Dev_Story_Impact: How well this demonstrates AI-driven process improvement (1-5)
  - Dependency_Weight: 2.0 if it unblocks other improvements; 1.0 if independent
  - Effort: 1=XS, 2=S, 3=M, 4=L, 5=XL
- **Priority Label**: Map the score to a tier:
  - Score >= 5.0 → `priority:high`
  - Score >= 2.0 → `priority:medium`
  - Score >= 1.0 → `priority:low`
  - Score < 1.0 → `priority:backlog`
- **Effort Label**: `size:XS`, `size:S`, `size:M`, `size:L`, or `size:XL`

---

### Phase 4: Present to User

**Goal:** Let the user choose which improvements to create as GitHub issues.

Present the proposals in a numbered list:

```markdown
## Proposed Improvements

1. **[Title]** (priority:[level], size:[size], score: [X.X])
   Problem: [1 sentence]
   Fix: [1 sentence]
   Files: [paths]

2. **[Title]** ...
```

Then use `AskUserQuestion` with `multiSelect` to ask:
"Which improvements should I create as GitHub issues? Select all that apply."

Options should be formatted as: `"[number]. [title] (priority:[level])"` for each proposal.

---

### Phase 5: Create Issues

**Goal:** Create GitHub issues for each approved improvement.

For each selected improvement:

```bash
gh issue create --repo mattjonesorg/ABLE-Expense-Tracker \
  --title "[title]" \
  --label "enhancement,priority:[level],size:[size]" \
  --body "$(cat <<'EOF'
## Context

Found during Sprint [N] retrospective.

## Problem

[Detailed description of what went wrong, with examples from the sprint]

## Proposed Fix

[Specific changes to make]

## Files to Change

- [file path 1]
- [file path 2]

## Acceptance Criteria

- [ ] [Specific criteria for this improvement]
- [ ] Change is tested or verified
- [ ] Relevant documentation updated
EOF
)"
```

---

## Output Format

When the skill completes, produce this summary:

```markdown
## Sprint [N] Retrospective

### Issues Encountered: [count]
### Patterns Identified: [count]
### Improvements Proposed: [count]
### Issues Created: [count]

| # | Issue Title | Priority | Files Affected |
|---|-------------|----------|----------------|
| [num] | [title] | [priority] | [files] |

### Summary
[1-2 sentence summary of the sprint's process health and key takeaway]
```

## Error Handling

- **No sprint data found**: Ask the user for the sprint number and issue log manually.
- **No issues in the SM log**: Report "No agent issues were logged this sprint. The retrospective has no patterns to analyze." and ask if the user wants to do a general retrospective instead.
- **gh CLI not authenticated**: Prompt user to run `gh auth login`.
- **User selects no improvements**: Report "No improvements selected. Retrospective complete with no action items." and stop gracefully.
- **Issue creation fails**: Report the error, continue with remaining issues, and list failures at the end.
