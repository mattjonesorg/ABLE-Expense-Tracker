#!/usr/bin/env bash
# Test suite for check-ci-antipatterns.sh
# Simulates PreToolUse JSON input and verifies the hook catches
# || true / || exit 0 / ; true on test commands in workflow files.
#
# Exit 0 = allow, exit 2 = block

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_SCRIPT="$SCRIPT_DIR/check-ci-antipatterns.sh"

PASS=0
FAIL=0
TESTS_RUN=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Helper: run the hook with simulated PreToolUse JSON input
# Usage: run_test "test name" "tool_name" "file_path" "content" expected_exit_code
run_test() {
  local test_name="$1"
  local tool_name="$2"
  local file_path="$3"
  local content="$4"
  local expected_exit="$5"

  TESTS_RUN=$((TESTS_RUN + 1))

  # Build JSON input matching PreToolUse schema
  local json_input
  if [ "$tool_name" = "Write" ]; then
    json_input=$(jq -n \
      --arg tn "$tool_name" \
      --arg fp "$file_path" \
      --arg c "$content" \
      '{tool_name: $tn, tool_input: {file_path: $fp, content: $c}}')
  else
    json_input=$(jq -n \
      --arg tn "$tool_name" \
      --arg fp "$file_path" \
      --arg c "$content" \
      '{tool_name: $tn, tool_input: {file_path: $fp, new_string: $c}}')
  fi

  local actual_exit=0
  echo "$json_input" | bash "$HOOK_SCRIPT" > /dev/null 2>&1 || actual_exit=$?

  if [ "$actual_exit" -eq "$expected_exit" ]; then
    echo -e "  ${GREEN}PASS${NC}: $test_name"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC}: $test_name (expected exit=$expected_exit, got exit=$actual_exit)"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "========================================"
echo " Testing check-ci-antipatterns.sh"
echo "========================================"
echo ""

# ---- Tests that SHOULD be blocked (exit 2) ----
echo -e "${YELLOW}--- Patterns that should be BLOCKED ---${NC}"

run_test "|| true on test command" \
  "Write" \
  ".github/workflows/test.yml" \
  "      - name: Test
        run: pnpm test || true" \
  2

run_test "|| true on vitest command" \
  "Write" \
  ".github/workflows/ci.yml" \
  "      - name: Run tests
        run: npx vitest || true" \
  2

run_test "|| true on playwright command" \
  "Write" \
  ".github/workflows/e2e.yml" \
  "      - name: E2E
        run: pnpm exec playwright test || true" \
  2

run_test "|| exit 0 on test command" \
  "Write" \
  ".github/workflows/test.yml" \
  "      - name: Test
        run: pnpm test || exit 0" \
  2

run_test "; true after test command" \
  "Write" \
  ".github/workflows/test.yml" \
  "      - name: Test
        run: pnpm test ; true" \
  2

run_test "|| true on test:e2e command" \
  "Edit" \
  ".github/workflows/e2e.yml" \
  "        run: pnpm --filter web test:e2e || true" \
  2

run_test "|| true on jest command" \
  "Write" \
  ".github/workflows/test.yml" \
  "        run: npx jest --coverage || true" \
  2

# ---- Tests that SHOULD be allowed (exit 0) ----
echo ""
echo -e "${YELLOW}--- Patterns that should be ALLOWED ---${NC}"

run_test "Clean test command (no || true)" \
  "Write" \
  ".github/workflows/test.yml" \
  "      - name: Test
        run: pnpm test" \
  0

run_test "Non-workflow file with || true" \
  "Write" \
  "scripts/run-tests.sh" \
  "pnpm test || true" \
  0

run_test "|| true on non-test command in workflow" \
  "Write" \
  ".github/workflows/deploy.yml" \
  "        run: aws cloudformation describe-stacks || true" \
  0

run_test "continue-on-error instead of || true" \
  "Write" \
  ".github/workflows/test.yml" \
  "      - name: Test
        run: pnpm test
        continue-on-error: true" \
  0

run_test "Non-Write/Edit tool" \
  "Bash" \
  ".github/workflows/test.yml" \
  "pnpm test || true" \
  0

run_test "Comment mentioning || true" \
  "Write" \
  ".github/workflows/test.yml" \
  "      # Never use || true on test commands" \
  0

run_test "Clean playwright command" \
  "Write" \
  ".github/workflows/e2e.yml" \
  "        run: pnpm --filter web test:e2e
        env:
          CI: 'true'" \
  0

# ---- Summary ----
echo ""
echo "========================================"
echo " Test Summary"
echo "========================================"
echo ""
echo -e "  Total:  $TESTS_RUN"
echo -e "  ${GREEN}Passed: $PASS${NC}"
if [ "$FAIL" -gt 0 ]; then
  echo -e "  ${RED}Failed: $FAIL${NC}"
else
  echo -e "  Failed: $FAIL"
fi
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}SOME TESTS FAILED${NC}"
  exit 1
else
  echo -e "${GREEN}ALL TESTS PASSED${NC}"
  exit 0
fi
