#!/usr/bin/env bash
# Pre-commit hook: scan staged files for secrets and sensitive data
#
# This hook prevents committing:
#   - AWS Access Key IDs
#   - AWS Secret Access Keys
#   - Anthropic API keys
#   - Generic secrets (api_key, password, token, etc. with values)
#   - Private keys (RSA, EC, DSA, OPENSSH)
#   - AWS Account IDs in ARNs (real 12-digit account IDs)
#   - Hardcoded AWS account IDs
#
# Known-safe patterns are allowed:
#   - Placeholder account ID 123456789012
#   - CDK token references ${Token[...]}
#   - Test fixtures with clearly mock values
#   - Documentation comments describing patterns

set -euo pipefail

VIOLATIONS_FOUND=0
VIOLATION_DETAILS=""

# Get staged files (Added, Copied, Modified only)
STAGED_FILES=$(git diff --cached --diff-filter=ACM --name-only 2>/dev/null || true)

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

add_violation() {
  local file="$1"
  local line_num="$2"
  local pattern_name="$3"
  local matched_line="$4"
  VIOLATIONS_FOUND=$((VIOLATIONS_FOUND + 1))
  VIOLATION_DETAILS="${VIOLATION_DETAILS}\n  [${pattern_name}] ${file}:${line_num}"
  VIOLATION_DETAILS="${VIOLATION_DETAILS}\n    ${matched_line}"
}

scan_file() {
  local file="$1"

  # Skip binary files
  if file --mime-type "$(git rev-parse --show-toplevel)/$file" 2>/dev/null | grep -qv 'text/'; then
    # Double-check: if git show works and produces text-like content, scan it anyway
    if ! git show ":$file" 2>/dev/null | head -1 | grep -qP '[\x00-\x08\x0E-\x1F]'; then
      : # Not binary after all, continue scanning
    else
      return
    fi
  fi

  # Get staged content
  local content
  content=$(git show ":$file" 2>/dev/null) || return

  local line_num=0
  while IFS= read -r line; do
    line_num=$((line_num + 1))

    # Skip empty lines
    [ -z "$line" ] && continue

    # --- Pattern 1: AWS Access Key IDs ---
    if echo "$line" | grep -qE 'AKIA[0-9A-Z]{16}'; then
      # Allow if in a comment that's clearly documentation/example
      if echo "$line" | grep -qiE '^\s*(#|//|/?\*|<!--).*example|placeholder|dummy|fake|test|documentation'; then
        continue
      fi
      add_violation "$file" "$line_num" "AWS Access Key ID" "$line"
    fi

    # --- Pattern 2: AWS Secret Access Keys ---
    if echo "$line" | grep -qiE '(secret|aws_secret|SECRET_KEY|secret_access_key).*[0-9a-zA-Z/+]{40}'; then
      # Allow CDK tokens
      if echo "$line" | grep -qE '\$\{Token\['; then
        continue
      fi
      # Allow if the variable name / context (not the secret value) contains mock/test keywords
      # Extract the part before the secret value to check for allow-words
      local before_value
      before_value=$(echo "$line" | sed -E "s/['\"]?[0-9a-zA-Z/+]{40}['\"]?.*//")
      if echo "$before_value" | grep -qiE '\b(mock|fake|test|dummy|example|placeholder)\b'; then
        continue
      fi
      add_violation "$file" "$line_num" "AWS Secret Access Key" "$line"
    fi

    # --- Pattern 3: Anthropic API keys ---
    if echo "$line" | grep -qE 'sk-ant-[a-zA-Z0-9_-]{20,}'; then
      # Allow if clearly a test/mock/example
      if echo "$line" | grep -qiE '(mock|fake|test|dummy|example|placeholder)'; then
        continue
      fi
      add_violation "$file" "$line_num" "Anthropic API Key" "$line"
    fi

    # --- Pattern 4: Generic secrets with values ---
    if echo "$line" | grep -qiE "(api_key|api_secret|secret_key|private_key|password|token)\s*[:=]\s*['\"][^'\"]+['\"]"; then
      # Allow CDK tokens
      if echo "$line" | grep -qE '\$\{Token\['; then
        continue
      fi
      # Allow environment variable references (not actual secrets)
      if echo "$line" | grep -qE "process\.env\.|os\.environ|env\(|getenv"; then
        continue
      fi
      # Allow if the variable name / context (before the value) contains mock/test keywords
      # Extract everything before the quoted value for allow-word matching
      local before_secret_value
      before_secret_value=$(echo "$line" | sed -E "s/[:=]\s*['\"][^'\"]+['\"].*//" )
      if echo "$before_secret_value" | grep -qiE '\b(mock|fake|test|dummy|example|placeholder|changeme|TODO)\b'; then
        continue
      fi
      # Also allow if the value itself is clearly a placeholder (not embedded in a real-looking secret)
      local secret_value
      secret_value=$(echo "$line" | sed -nE "s/.*[:=]\s*['\"]([^'\"]+)['\"].*/\1/p")
      if echo "$secret_value" | grep -qiE '^(mock|fake|test|dummy|example|placeholder|your-|changeme|TODO|xxx+)'; then
        continue
      fi
      # Allow type definitions and interfaces (no actual value)
      if echo "$line" | grep -qE '(interface|type|:\s*string|:\s*String)'; then
        continue
      fi
      # Allow if it's the check-secrets.sh script itself (pattern documentation)
      if [ "$file" = ".claude/hooks/check-secrets.sh" ] || [ "$file" = ".claude/hooks/test-check-secrets.sh" ]; then
        continue
      fi
      add_violation "$file" "$line_num" "Generic Secret" "$line"
    fi

    # --- Pattern 5: Private keys ---
    if echo "$line" | grep -qE '\-\-\-\-\-BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY\-\-\-\-\-'; then
      # Allow if in a comment that's clearly documentation
      if echo "$line" | grep -qiE '^\s*(#|//|/?\*|<!--)'; then
        continue
      fi
      # Allow if it's the check-secrets.sh or test script itself
      if [ "$file" = ".claude/hooks/check-secrets.sh" ] || [ "$file" = ".claude/hooks/test-check-secrets.sh" ]; then
        continue
      fi
      add_violation "$file" "$line_num" "Private Key" "$line"
    fi

    # --- Pattern 6: AWS Account IDs in ARNs ---
    if echo "$line" | grep -qE 'arn:aws:[a-zA-Z0-9-]+:[a-z0-9-]*:[0-9]{12}:'; then
      # Allow placeholder account ID 123456789012
      if echo "$line" | grep -qE 'arn:aws:[a-zA-Z0-9-]+:[a-z0-9-]*:123456789012:'; then
        continue
      fi
      # Allow CDK tokens
      if echo "$line" | grep -qE '\$\{Token\['; then
        continue
      fi
      # Allow if it's the check-secrets.sh or test script itself
      if [ "$file" = ".claude/hooks/check-secrets.sh" ] || [ "$file" = ".claude/hooks/test-check-secrets.sh" ]; then
        continue
      fi
      add_violation "$file" "$line_num" "AWS Account ID in ARN" "$line"
    fi

    # --- Pattern 7: Hardcoded AWS account IDs ---
    if echo "$line" | grep -qiE 'account.{0,10}[:=]\s*['\''"]?[0-9]{12}['\''"]?'; then
      # Allow placeholder account ID 123456789012
      if echo "$line" | grep -qE '123456789012'; then
        continue
      fi
      # Allow CDK tokens
      if echo "$line" | grep -qE '\$\{Token\['; then
        continue
      fi
      # Allow if it's the check-secrets.sh or test script itself
      if [ "$file" = ".claude/hooks/check-secrets.sh" ] || [ "$file" = ".claude/hooks/test-check-secrets.sh" ]; then
        continue
      fi
      add_violation "$file" "$line_num" "Hardcoded AWS Account ID" "$line"
    fi

  done <<< "$content"
}

# Scan each staged file
for file in $STAGED_FILES; do
  scan_file "$file"
done

if [ "$VIOLATIONS_FOUND" -gt 0 ]; then
  echo ""
  echo "========================================"
  echo " SECRETS DETECTED - COMMIT BLOCKED"
  echo "========================================"
  echo ""
  echo "Found $VIOLATIONS_FOUND potential secret(s) in staged files:"
  echo -e "$VIOLATION_DETAILS"
  echo ""
  echo "If these are false positives, you can:"
  echo "  1. Move the value to an environment variable"
  echo "  2. Use a placeholder value (e.g., 123456789012 for AWS account IDs)"
  echo "  3. Add 'mock', 'fake', 'test', 'example', or 'placeholder' to the line"
  echo ""
  exit 1
fi

exit 0
