#!/usr/bin/env bash
#
# Stop Hook - CCOrch Wrapper
#
# Only calls CCOrch for sessions with active workflows (marker exists).
# Cleans up session marker after API call.
#

set -euo pipefail

# Read entire JSON payload from stdin
PAYLOAD=$(cat)

# Extract session_id field using jq
SESSION_ID=$(echo "$PAYLOAD" | jq -r '.session_id // empty')

# Fast path: Check if this session has an active CCOrch workflow
MARKER_FILE="/tmp/ccorch-session-${SESSION_ID}"
if [[ -z "$SESSION_ID" ]] || [[ ! -f "$MARKER_FILE" ]]; then
  # No active CCOrch workflow - exit silently
  exit 0
fi

# Active workflow exists - check if server is reachable
if ! timeout 0.1 bash -c "echo >/dev/tcp/localhost/3000" 2>/dev/null; then
  # Server not reachable - cleanup marker and exit
  rm -f "$MARKER_FILE" 2>/dev/null || true
  exit 0
fi

# Forward to CCOrch for workflow cleanup
echo "$PAYLOAD" | curl -s -X POST \
  -H 'X-Hook-Secret: secret' \
  -H 'Content-Type: application/json' \
  -d @- \
  http://localhost:3000/hooks/stop 2>/dev/null || true

# Cleanup session marker
rm -f "$MARKER_FILE" 2>/dev/null || true
