#!/usr/bin/env bash
# PreToolUse hook: detect || true, || exit 0, ; true on test commands in workflow files
#
# Receives JSON on stdin with tool_name and tool_input.
# For Write: checks tool_input.content
# For Edit: checks tool_input.new_string
#
# Exit 0 = allow, exit 2 = block (stderr shown to user)

set -euo pipefail

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only check Write and Edit tools
case "$TOOL_NAME" in
  Write|Edit) ;;
  *) exit 0 ;;
esac

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only check workflow YAML files
case "$FILE_PATH" in
  *.github/workflows/*.yml|*.github/workflows/*.yaml) ;;
  .github/workflows/*.yml|.github/workflows/*.yaml) ;;
  *) exit 0 ;;
esac

# Extract content to scan
if [ "$TOOL_NAME" = "Write" ]; then
  CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty')
elif [ "$TOOL_NAME" = "Edit" ]; then
  CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty')
fi

if [ -z "$CONTENT" ]; then
  exit 0
fi

VIOLATIONS_FOUND=0
VIOLATION_DETAILS=""

# Test-related command patterns
TEST_PATTERN='(pnpm\s+(test|.*test:e2e)|npx\s+(vitest|jest|playwright)|playwright\s+test|vitest|jest)'

# Anti-patterns that suppress test failures
ANTIPATTERN='\|\|\s*(true|exit\s+0)|;\s*true\s*$'

line_num=0
while IFS= read -r line; do
  line_num=$((line_num + 1))

  [ -z "$line" ] && continue

  # Skip comment lines
  if echo "$line" | grep -qE '^\s*#'; then
    continue
  fi

  # Check if this line has a test command AND a failure-suppressing antipattern
  if echo "$line" | grep -qiP "$TEST_PATTERN" && echo "$line" | grep -qP "$ANTIPATTERN"; then
    VIOLATIONS_FOUND=$((VIOLATIONS_FOUND + 1))
    VIOLATION_DETAILS="${VIOLATION_DETAILS}\n  Line ${line_num}: ${line}"
  fi
done <<< "$CONTENT"

if [ "$VIOLATIONS_FOUND" -gt 0 ]; then
  echo "BLOCKED: Found $VIOLATIONS_FOUND test command(s) with failure-suppressing antipattern in ${FILE_PATH}:" >&2
  echo -e "$VIOLATION_DETAILS" >&2
  echo "" >&2
  echo "Why: Using '|| true', '|| exit 0', or '; true' on test commands silently swallows" >&2
  echo "test failures, making the entire CI pipeline decorative (Sprint 7 retro item #2)." >&2
  echo "" >&2
  echo "Instead, use 'continue-on-error: true' at the step level if you need the workflow" >&2
  echo "to continue after test failures while still reporting the failure status." >&2
  exit 2
fi

exit 0
