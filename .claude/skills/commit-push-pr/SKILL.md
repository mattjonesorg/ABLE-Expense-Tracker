# Skill: Commit, Push & Create PR

## Purpose

Standardized procedure for committing work, pushing to remote, and creating a pull request. All agents MUST follow this procedure — it prevents stale branches, unrelated commits, and messy PRs.

## When to Use

- When an agent has completed its implementation work and is ready to submit
- When the user says "commit and push" or "create a PR"
- Referenced by `plan-next-sprint` in agent prompts

## Procedure

Execute these steps in order. Do NOT skip any step.

### Step 1: Run All Tests

```bash
pnpm -r run test
```

If any test fails, STOP. Fix the failures before proceeding. Do NOT commit broken code.

### Step 2: Check What Will Be Committed

```bash
git status
git diff --stat
```

Review the changes. Ensure:
- No secrets, credentials, or `.env` files are staged
- No unrelated files are included
- All intended changes are present

### Step 3: Stage Changes

Stage specific files (preferred) or all changes:

```bash
git add <specific-files>
```

Avoid `git add -A` unless you've verified no sensitive files exist.

### Step 4: Commit with Conventional Commits

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <description>

<optional body explaining why>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

Types: `feat`, `fix`, `test`, `docs`, `chore`, `ci`, `refactor`

### Step 5: Rebase onto Latest Main (MANDATORY)

This prevents stale-branch issues and unrelated commits in PRs.

```bash
git fetch origin main && git rebase origin/main
```

If the rebase produces conflicts:
1. Resolve each conflict
2. `git rebase --continue`
3. Re-run tests: `pnpm -r run test`

### Step 6: Verify Your Branch

```bash
git log --oneline main..HEAD
```

If you see commits that are NOT yours, STOP and investigate. Your branch should only contain your work.

### Step 7: Push to Remote

```bash
git push -u origin <branch-name>
```

If the push is rejected (e.g., after rebase), use `git push --force-with-lease` (NOT `--force`).

### Step 8: Create Pull Request

```bash
gh pr create --title "<type>: <short description> (#<issue>)" --body "$(cat <<'EOF'
## Summary
<1-3 bullet points describing what changed and why>

## Test plan
- [ ] All unit tests pass
- [ ] TypeScript strict-clean
- [ ] <additional test steps specific to this change>

Closes #<issue-number>

Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## Error Handling

| Problem | Action |
|---------|--------|
| Tests fail | Fix failures, do NOT commit |
| Rebase conflicts | Resolve, re-run tests, then continue |
| Push rejected | Use `--force-with-lease` (never `--force`) |
| `gh` not authenticated | Run `gh auth login` |
| Wrong commits in branch | Investigate with `git log`, do NOT push |

## For Agents in Worktrees

If you are working in an isolated worktree:
1. Run `pwd` to confirm you're in your worktree directory
2. Run `pnpm install` before testing (worktree may have stale deps)
3. Follow all steps above from within the worktree
4. After PR creation, report the PR URL back to the team lead
