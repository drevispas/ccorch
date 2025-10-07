#!/usr/bin/env bash
#
# PostToolUse Hook - CCOrch Wrapper
#
# Fast-path filtering using session markers to avoid unnecessary processing.
# Only forwards Task tool invocations from active CCOrch sessions.
#

set -euo pipefail

# Read entire JSON payload from stdin
PAYLOAD=$(cat)

# Extract session_id field using jq
SESSION_ID=$(echo "$PAYLOAD" | jq -r '.session_id // empty')

# Fast path: Check session marker first
if [[ -z "$SESSION_ID" ]] || [[ ! -f "/tmp/ccorch-session-${SESSION_ID}" ]]; then
  # No active CCOrch session - exit immediately
  exit 0
fi

# CCOrch session active - extract tool_name
TOOL_NAME=$(echo "$PAYLOAD" | jq -r '.tool_name // empty')

# Exit silently if not Task tool
if [[ "$TOOL_NAME" != "Task" ]]; then
  exit 0
fi

# Task tool in CCOrch session - check if server is reachable
if ! timeout 0.1 bash -c "echo >/dev/tcp/localhost/3000" 2>/dev/null; then
  # Server not reachable - exit silently
  exit 0
fi

# Forward to CCOrch (server will do session correlation)
RESPONSE=$(echo "$PAYLOAD" | curl -s -X POST \
  -H 'X-Hook-Secret: secret' \
  -H 'Content-Type: application/json' \
  -d @- \
  http://localhost:3000/hooks/post-tool-use 2>/dev/null || echo "")

# Output response for Claude Code
echo "$RESPONSE"
