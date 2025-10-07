#!/usr/bin/env bash
#
# UserPromptSubmit Hook - CCOrch Wrapper
#
# Filters prompts for \cco or \c2o trigger before forwarding to CCOrch server.
# Creates session marker file on successful workflow creation.
#

set -euo pipefail

# Read entire JSON payload from stdin
PAYLOAD=$(cat)

# Extract session_id and prompt fields using jq
SESSION_ID=$(echo "$PAYLOAD" | jq -r '.session_id // empty')
PROMPT=$(echo "$PAYLOAD" | jq -r '.prompt // empty')

# Exit silently if no prompt field
if [[ -z "$PROMPT" ]]; then
  exit 0
fi

# Check for trigger patterns: \cco or \c2o (case insensitive)
if ! echo "$PROMPT" | grep -qiE '^\s*\\(cco|c2o)\s+'; then
  # No trigger - exit silently (no orchestration)
  exit 0
fi

# Trigger found - check if server is reachable
if ! timeout 0.1 bash -c "echo >/dev/tcp/localhost/3000" 2>/dev/null; then
  # Server not reachable - exit silently
  exit 0
fi

# Forward to CCOrch and capture response
RESPONSE=$(echo "$PAYLOAD" | curl -s -X POST \
  -H 'X-Hook-Secret: secret' \
  -H 'Content-Type: application/json' \
  -d @- \
  http://localhost:3000/hooks/user-prompt-submit 2>/dev/null || echo "")

# Check if response indicates successful workflow creation
# Response has .hookSpecificOutput when workflow is created
if echo "$RESPONSE" | jq -e '.hookSpecificOutput' >/dev/null 2>&1; then
  # Workflow created - create session marker
  if [[ -n "$SESSION_ID" ]]; then
    touch "/tmp/ccorch-session-${SESSION_ID}" 2>/dev/null || true
  fi
fi

# Output response for Claude Code to display
echo "$RESPONSE"
