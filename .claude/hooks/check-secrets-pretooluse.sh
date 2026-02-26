#!/usr/bin/env bash
# PreToolUse hook: scan content being written/edited for secrets
#
# Receives JSON on stdin with tool_name and tool_input.
# For Write: checks tool_input.content
# For Edit: checks tool_input.new_string
#
# Exit 0 = allow, exit 2 = block (stderr shown to user)

set -euo pipefail

# Read JSON from stdin
INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only check Write and Edit tools
case "$TOOL_NAME" in
  Write|Edit) ;;
  *) exit 0 ;;
esac

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Skip checking the hook scripts themselves
case "$FILE_PATH" in
  */.claude/hooks/check-secrets*) exit 0 ;;
  */.claude/hooks/test-check-secrets*) exit 0 ;;
esac

# Extract the content to scan
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

add_violation() {
  local line_num="$1"
  local pattern_name="$2"
  local matched_line="$3"
  VIOLATIONS_FOUND=$((VIOLATIONS_FOUND + 1))
  VIOLATION_DETAILS="${VIOLATION_DETAILS}\n  [${pattern_name}] ${FILE_PATH}:${line_num}"
  VIOLATION_DETAILS="${VIOLATION_DETAILS}\n    ${matched_line}"
}

line_num=0
while IFS= read -r line; do
  line_num=$((line_num + 1))

  [ -z "$line" ] && continue

  # --- AWS Access Key IDs ---
  if echo "$line" | grep -qE 'AKIA[0-9A-Z]{16}'; then
    if echo "$line" | grep -qiE '^\s*(#|//|/?\*|<!--).*example|placeholder|dummy|fake|test|documentation'; then
      continue
    fi
    add_violation "$line_num" "AWS Access Key ID" "$line"
  fi

  # --- AWS Secret Access Keys ---
  if echo "$line" | grep -qiE '(secret|aws_secret|SECRET_KEY|secret_access_key).*[0-9a-zA-Z/+]{40}'; then
    if echo "$line" | grep -qE '\$\{Token\['; then
      continue
    fi
    before_value=$(echo "$line" | sed -E "s/['\"]?[0-9a-zA-Z/+]{40}['\"]?.*//")
    if echo "$before_value" | grep -qiE '\b(mock|fake|test|dummy|example|placeholder)\b'; then
      continue
    fi
    add_violation "$line_num" "AWS Secret Access Key" "$line"
  fi

  # --- Anthropic API keys ---
  if echo "$line" | grep -qE 'sk-ant-[a-zA-Z0-9_-]{20,}'; then
    if echo "$line" | grep -qiE '(mock|fake|test|dummy|example|placeholder)'; then
      continue
    fi
    add_violation "$line_num" "Anthropic API Key" "$line"
  fi

  # --- Generic secrets with values ---
  if echo "$line" | grep -qiE "(api_key|api_secret|secret_key|private_key|password|token)\s*[:=]\s*['\"][^'\"]+['\"]"; then
    if echo "$line" | grep -qE '\$\{Token\['; then
      continue
    fi
    if echo "$line" | grep -qE "process\.env\.|os\.environ|env\(|getenv"; then
      continue
    fi
    before_secret_value=$(echo "$line" | sed -E "s/[:=]\s*['\"][^'\"]+['\"].*//" )
    if echo "$before_secret_value" | grep -qiE '\b(mock|fake|test|dummy|example|placeholder|changeme|TODO)\b'; then
      continue
    fi
    secret_value=$(echo "$line" | sed -nE "s/.*[:=]\s*['\"]([^'\"]+)['\"].*/\1/p")
    if echo "$secret_value" | grep -qiE '^(mock|fake|test|dummy|example|placeholder|your-|changeme|TODO|xxx+)'; then
      continue
    fi
    if echo "$line" | grep -qE '(interface|type|:\s*string|:\s*String)'; then
      continue
    fi
    add_violation "$line_num" "Generic Secret" "$line"
  fi

  # --- Private keys ---
  if echo "$line" | grep -qE '\-\-\-\-\-BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY\-\-\-\-\-'; then
    if echo "$line" | grep -qiE '^\s*(#|//|/?\*|<!--)'; then
      continue
    fi
    add_violation "$line_num" "Private Key" "$line"
  fi

  # --- AWS Account IDs in ARNs ---
  if echo "$line" | grep -qE 'arn:aws:[a-zA-Z0-9-]+:[a-z0-9-]*:[0-9]{12}:'; then
    if echo "$line" | grep -qE 'arn:aws:[a-zA-Z0-9-]+:[a-z0-9-]*:123456789012:'; then
      continue
    fi
    if echo "$line" | grep -qE '\$\{Token\['; then
      continue
    fi
    add_violation "$line_num" "AWS Account ID in ARN" "$line"
  fi

  # --- Route53 Hosted Zone IDs ---
  if echo "$line" | grep -qiE '(hosted_?zone_?id|hostedZoneId|hosted_zone)\s*[:=]\s*['\''"]?Z[A-Z0-9]{8,32}['\''"]?'; then
    if echo "$line" | grep -qE '\$\{Token\['; then
      continue
    fi
    hz_before=$(echo "$line" | sed -E "s/[:=]\s*['\"]?Z[A-Z0-9]{8,32}.*//" )
    if echo "$hz_before" | grep -qiE '\b(mock|fake|test|dummy|example|placeholder)\b'; then
      continue
    fi
    add_violation "$line_num" "Route53 Hosted Zone ID" "$line"
  fi

  # --- Hardcoded ACM certificate ARNs ---
  if echo "$line" | grep -qiE '(certificate_?arn|certificateArn)\s*[:=]\s*['\''"]?arn:aws:acm:'; then
    if echo "$line" | grep -qE '\$\{Token\['; then
      continue
    fi
    if echo "$line" | grep -qE '123456789012'; then
      continue
    fi
    cert_before=$(echo "$line" | sed -E "s/[:=]\s*['\"]?arn:aws:acm:.*//" )
    if echo "$cert_before" | grep -qiE '\b(mock|fake|test|dummy|example|placeholder)\b'; then
      continue
    fi
    add_violation "$line_num" "Hardcoded ACM Certificate ARN" "$line"
  fi

  # --- Hardcoded AWS account IDs ---
  if echo "$line" | grep -qiE 'account.{0,10}[:=]\s*['\''"]?[0-9]{12}['\''"]?'; then
    if echo "$line" | grep -qE '123456789012'; then
      continue
    fi
    if echo "$line" | grep -qE '\$\{Token\['; then
      continue
    fi
    add_violation "$line_num" "Hardcoded AWS Account ID" "$line"
  fi

done <<< "$CONTENT"

if [ "$VIOLATIONS_FOUND" -gt 0 ]; then
  echo "Found $VIOLATIONS_FOUND potential secret(s) in content being written to ${FILE_PATH}:" >&2
  echo -e "$VIOLATION_DETAILS" >&2
  echo "" >&2
  echo "Use a placeholder value, environment variable, or add 'mock'/'test'/'example' to the line." >&2
  exit 2
fi

exit 0
