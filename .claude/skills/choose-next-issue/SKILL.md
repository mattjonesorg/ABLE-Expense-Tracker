# Skill: Choose Next Issue

## Purpose

Select the next issue(s) to work on from the GitHub backlog, using the same prioritization scheme the Product Owner uses. This ensures consistent priority ordering regardless of who triggers issue selection.

## When to Use

- Scrum Master calls this during sprint planning
- Any agent needs to know what to work on next
- After completing an issue, to pick up the next one

## Prioritization Scheme (from CLAUDE.md)

### Priority Tiers

Issues are labeled with priority tiers. Always work top-down:

| Tier | Label | Work on ONLY when... |
|------|-------|---------------------|
| P0 | `priority:critical` | Always — these come first |
| P1 | `priority:high` | All P0 issues are done or in progress |
| P2 | `priority:medium` | All P1 issues are done or in progress |
| P3 | `priority:low` | All P2 issues are done or in progress |
| P4 | `priority:backlog` | All P3 issues are done or in progress |

### Scoring Within a Tier

When multiple issues exist in the same tier, score them:

```
Score = (User_Impact × Dev_Story_Impact × Dependency_Weight) / Effort
```

- **User_Impact** (1–5): Value to ABLE account managers
- **Dev_Story_Impact** (1–5): Demonstrates AI-driven development practices
- **Dependency_Weight**: 2.0 if it unblocks other issues; 1.0 if independent; 0.5 if blocked by other work
- **Effort**: 1=XS, 2=S, 3=M, 4=L, 5=XL (use size labels if present)

### Selection Rules

1. **Never select a blocked issue** — if it depends on an open issue, skip it
2. **Prefer issues that unblock others** — higher Dependency_Weight
3. **Balance across agents** — don't assign 3 issues to Backend when Frontend is idle
4. **Respect WIP limits** — no agent should have more than 2 issues in progress
5. **If scores are tied**, prefer the issue that unblocks more downstream work

## Procedure

### Step 1: Fetch Open Issues

```bash
gh issue list --state open --json number,title,labels,assignees,body --limit 50
```

### Step 2: Categorize by Priority Tier

Group issues by their `priority:*` label. If an issue lacks a priority label, flag it for the Product Owner to triage.

### Step 3: Check Dependencies

Read issue bodies for dependency references (e.g., "Depends on #12", "Blocked by #5"). An issue is blocked if any of its dependencies are still open.

### Step 4: Filter to Current Tier

Find the highest-priority tier that has unassigned, unblocked issues. This is the working tier.

### Step 5: Score Candidates

For each unassigned, unblocked issue in the working tier:
1. Read the issue body for context
2. Score User_Impact, Dev_Story_Impact, Effort
3. Check if other issues reference this one as a dependency → set Dependency_Weight
4. Calculate final score

### Step 6: Select and Assign

1. Pick the highest-scoring issue
2. Determine the appropriate agent based on the issue's domain:
   - `web/` changes → Frontend Engineer
   - `api/` changes → Backend Engineer
   - `infra/` or `.github/` changes → DevOps Engineer
   - Documentation → Technical Writer
   - Test strategy/coverage → QA Engineer
   - Multiple domains → Architect coordinates, Scrum Master assigns
3. Output the recommendation

### Step 7: Update Issue

```bash
# Add in-progress label
gh issue edit <number> --add-label "status:in-progress"

# Assign to agent (using a comment since agents don't have GitHub accounts)
gh issue comment <number> --body "Assigned to: [Agent Name] | Sprint: [N] | Score: [X.X]"
```

## Output Format

```markdown
## Next Issue Recommendation

**Issue**: #<number> — <title>
**Priority**: <tier>
**Score**: <calculated score>
  - User Impact: X/5
  - Dev Story Impact: X/5
  - Dependency Weight: X.X
  - Effort: X/5
**Assigned Agent**: <agent name>
**Rationale**: <why this issue, why this agent>
**Dependencies**: <none, or list resolved dependencies>
**Unblocks**: <list of issues this will unblock, if any>
```

## Batch Selection (Sprint Planning)

During sprint planning, select multiple issues (typically 3-6 per sprint):

```bash
# Get the full board state
gh issue list --state open --json number,title,labels,assignees,body --limit 50
```

1. Run the selection procedure iteratively
2. After selecting each issue, update the available agent pool (respect WIP limits)
3. Stop when all agents have work or no more eligible issues exist
4. Present the sprint plan as a table:

```markdown
## Sprint Plan

| Issue | Title | Agent | Priority | Score |
|-------|-------|-------|----------|-------|
| #1 | ... | Backend Engineer | P0 | 8.0 |
| #2 | ... | Frontend Engineer | P0 | 6.0 |
| #3 | ... | DevOps Engineer | P0 | 5.5 |
```

## Handling Edge Cases

- **No issues in the current tier**: Move to the next tier
- **All issues are blocked**: Report the blocking chain to Scrum Master
- **Issue has no priority label**: Flag for Product Owner, do not select
- **Issue has no size label**: Estimate effort from the description, note the missing label
- **Agent is overloaded**: Select an issue for the least-loaded agent instead
