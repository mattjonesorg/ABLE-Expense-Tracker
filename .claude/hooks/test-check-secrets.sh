#!/usr/bin/env bash
# Test suite for check-secrets.sh
# Creates a temporary git repo, stages files with various patterns,
# and verifies the hook catches secrets and allows safe patterns.

set -euo pipefail

# Resolve the absolute path to check-secrets.sh relative to this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK_SECRETS="$SCRIPT_DIR/check-secrets.sh"

PASS=0
FAIL=0
TESTS_RUN=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

setup_temp_repo() {
  TEMP_DIR=$(mktemp -d)
  cd "$TEMP_DIR"
  git init --quiet
  git config user.email "test@test.com"
  git config user.name "Test"
  # Create an initial commit so we have a HEAD
  echo "init" > init.txt
  git add init.txt
  git commit --quiet -m "init"
}

cleanup_temp_repo() {
  cd /
  rm -rf "$TEMP_DIR"
}

# Test helper: stage a file with given content, run the hook, check exit code
# Usage: run_test "test name" "filename" "file content" expected_exit_code
run_test() {
  local test_name="$1"
  local filename="$2"
  local content="$3"
  local expected_exit="$4"

  TESTS_RUN=$((TESTS_RUN + 1))

  setup_temp_repo

  # Copy the check-secrets.sh into the temp repo so it can reference itself
  mkdir -p .claude/hooks
  cp "$CHECK_SECRETS" .claude/hooks/check-secrets.sh

  # Create the test file and stage it
  mkdir -p "$(dirname "$filename")"
  echo "$content" > "$filename"
  git add "$filename"

  # Run the hook and capture exit code
  local actual_exit=0
  bash "$CHECK_SECRETS" > /dev/null 2>&1 || actual_exit=$?

  if [ "$actual_exit" -eq "$expected_exit" ]; then
    echo -e "  ${GREEN}PASS${NC}: $test_name"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC}: $test_name (expected exit=$expected_exit, got exit=$actual_exit)"
    FAIL=$((FAIL + 1))
  fi

  cleanup_temp_repo
}

echo ""
echo "========================================"
echo " Testing check-secrets.sh"
echo "========================================"
echo ""

# ---- Tests that SHOULD be caught (exit 1) ----
echo -e "${YELLOW}--- Tests for patterns that should be BLOCKED ---${NC}"

run_test "AWS Access Key ID" \
  "config.js" \
  'const key = "AKIAIOSFODNN7EXAMPLE";' \
  1

run_test "AWS Secret Access Key" \
  "config.js" \
  'aws_secret_access_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYzAbCdEfGhIj"' \
  1

run_test "Anthropic API key" \
  "config.js" \
  'const apiKey = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890";' \
  1

run_test "Generic secret - api_key with value" \
  "app.ts" \
  "api_key = 'sk_live_abcdefg12345'" \
  1

run_test "Generic secret - password with value" \
  "db.ts" \
  'password: "SuperSecretP@ss123"' \
  1

run_test "Generic secret - token with value" \
  "auth.ts" \
  "token = 'ghp_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8'" \
  1

run_test "RSA Private Key" \
  "key.txt" \
  '-----BEGIN RSA PRIVATE KEY-----' \
  1

run_test "EC Private Key" \
  "key.txt" \
  '-----BEGIN EC PRIVATE KEY-----' \
  1

run_test "Generic Private Key" \
  "key.txt" \
  '-----BEGIN PRIVATE KEY-----' \
  1

run_test "OPENSSH Private Key" \
  "key.txt" \
  '-----BEGIN OPENSSH PRIVATE KEY-----' \
  1

run_test "AWS Account ID in ARN" \
  "stack.ts" \
  'const arn = "arn:aws:iam:us-east-1:987654321098:role/MyRole";' \
  1

run_test "Hardcoded AWS account ID" \
  "config.ts" \
  'accountId = "987654321098"' \
  1

# ---- Tests that SHOULD be allowed (exit 0) ----
echo ""
echo -e "${YELLOW}--- Tests for patterns that should be ALLOWED ---${NC}"

run_test "Placeholder AWS account 123456789012 in ARN" \
  "test.ts" \
  'const arn = "arn:aws:iam:us-east-1:123456789012:role/TestRole";' \
  0

run_test "Placeholder AWS account 123456789012 hardcoded" \
  "test.ts" \
  'accountId = "123456789012"' \
  0

run_test "CDK token reference" \
  "stack.ts" \
  'secret_key = "${Token[TOKEN.123]}"' \
  0

run_test "Mock API key in test" \
  "test/auth.test.ts" \
  'const mockApiKey = "sk-ant-api03-fake-mock-test-key-placeholder";' \
  0

run_test "Environment variable reference" \
  "config.ts" \
  'const apiKey = process.env.API_KEY;' \
  0

run_test "Type definition with secret_key" \
  "types.ts" \
  'interface Config { secret_key: string; }' \
  0

run_test "Comment documenting key pattern" \
  "docs.ts" \
  '// example: AKIAIOSFODNN7EXAMPLEX - this is a placeholder dummy key' \
  0

run_test "Clean code with no secrets" \
  "handler.ts" \
  'export const handler = async (event: APIGatewayEvent) => { return { statusCode: 200 }; };' \
  0

run_test "File with test/mock secret_key" \
  "test/config.test.ts" \
  "secret_key = 'test-mock-value-placeholder'" \
  0

run_test "No staged files (empty commit)" \
  "__no_stage__" \
  "" \
  0

# Override the no-staged-files test to not stage anything
TESTS_RUN=$((TESTS_RUN - 1))  # Undo the count from run_test
PASS=$((PASS - 1))  # Undo the count; we'll redo this test manually
TESTS_RUN=$((TESTS_RUN + 1))
setup_temp_repo
# Don't stage any new files
actual_exit=0
bash "$CHECK_SECRETS" > /dev/null 2>&1 || actual_exit=$?
if [ "$actual_exit" -eq 0 ]; then
  echo -e "  ${GREEN}PASS${NC}: No staged files (empty commit)"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}FAIL${NC}: No staged files (empty commit) (expected exit=0, got exit=$actual_exit)"
  FAIL=$((FAIL + 1))
fi
cleanup_temp_repo

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
