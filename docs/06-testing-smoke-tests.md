# CCOrch Smoke Tests

This document provides a manual smoke test checklist to verify that CCOrch is functioning correctly after deployment.

## Purpose

Smoke tests are quick validation tests performed after deployment to ensure basic functionality works before allowing production traffic.

**Time Required**: ~10 minutes

**When to Run**:
- After initial deployment
- After major updates
- After infrastructure changes
- Before promoting to production

---

## Prerequisites

- Server is running and accessible
- `.env` file is properly configured
- Database migrations have been applied
- You have `API_KEY_ADMIN` for admin operations

Set environment variables for testing:
```bash
export BASE_URL="http://localhost:3000"
export API_KEY_ADMIN="your-admin-api-key"
```

---

## Test Checklist

### Test 1: Health Check

**Objective**: Verify server is running and database is connected

```bash
curl ${BASE_URL}/health
```

**Expected Response** (200 OK):
```json
{
  "status": "ok",
  "uptime": <number>,
  "database": "connected",
  "timestamp": "<ISO-8601-timestamp>"
}
```

**✅ Pass Criteria**:
- HTTP status code is 200
- `status` field is "ok"
- `database` field is "connected"

**❌ Failure Actions**:
- Check server logs: `pm2 logs ccorch`
- Verify DATABASE_URL in .env
- Check database file permissions

---

### Test 2: Create Workflow via Hook

**Objective**: Verify workflow creation through UserPromptSubmit hook

**⚠️ Important**: Prompts must include `\cco` or `\c2o` trigger prefix for orchestration

**Setup**: Create test payload file `test-payload.json`:
```json
{
  "session_id": "test-session-123",
  "cwd": "/home/user/project",
  "prompt": "\\cco Implement user authentication API"
}
```

**Execute**:
```bash
curl -X POST ${BASE_URL}/hooks/user-prompt-submit \
  -H "Content-Type: application/json" \
  -H "X-Hook-Secret: ${HOOK_SECRET}" \
  -d @test-payload.json
```

**Expected Response** (200 OK):
```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "<agent-prompt>"
  }
}
```

**✅ Pass Criteria**:
- HTTP status code is 200
- Response includes `continue: true`
- Response includes `hookSpecificOutput.additionalContext` with agent prompt

**Verify in Database**:
```bash
# Open Prisma Studio
pnpm prisma studio

# Or query directly
sqlite3 dev.db "SELECT id, chain_name, complexity, status FROM workflows ORDER BY created_at DESC LIMIT 1;"
```

**Expected Database State**:
- New workflow record exists
- `status` is "ACTIVE"
- `chain_name` is one of the valid chains (e.g., "backend-development")

---

### Test 3: Query Workflow Status

**Objective**: Verify workflow status retrieval

**Execute**:
```bash
WORKFLOW_ID="<workflow-id-from-test-2>"

curl ${BASE_URL}/api/workflows/${WORKFLOW_ID}/status
```

**Expected Response** (200 OK):
```json
{
  "workflow_id": "<workflow-id>",
  "status": "ACTIVE",
  "chain_name": "backend-development",
  "complexity": "moderate",
  "current_step": 0,
  "total_steps": 3,
  "completed_agents": [],
  "summary": "Workflow started, step 0/3"
}
```

**✅ Pass Criteria**:
- HTTP status code is 200
- All expected fields are present
- `status` is "ACTIVE"
- `current_step` matches database
- `total_steps` matches chain length

---

### Test 4: Manual Transition (Admin API)

**Objective**: Verify admin transition API and audit logging

**Execute**: Advance workflow to next step manually
```bash
WORKFLOW_ID="<workflow-id-from-test-2>"

curl -X POST ${BASE_URL}/api/workflows/${WORKFLOW_ID}/transition \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY_ADMIN}" \
  -d '{
    "action": "advance",
    "reason": "Smoke test: manual advancement"
  }'
```

**Expected Response** (200 OK):
```json
{
  "workflow_id": "<workflow-id>",
  "previous_step": 0,
  "current_step": 1,
  "next_agent": "java-backend-developer-moderate",
  "status": "ACTIVE",
  "message": "Workflow advanced to step 1"
}
```

**✅ Pass Criteria**:
- HTTP status code is 200
- `current_step` is incremented (should be 1)
- `next_agent` matches expected next agent
- Transition is logged

**Verify Audit Log**:
```bash
sqlite3 dev.db "SELECT from_step, to_step, from_agent, to_agent, reason FROM workflow_transitions WHERE workflow_id = '<workflow-id>' ORDER BY created_at DESC LIMIT 1;"
```

**Expected Audit Log**:
- New transition record exists
- `from_step` is 0, `to_step` is 1
- `reason` contains "Smoke test: manual advancement"

---

### Test 5: Error Handling

**Objective**: Verify proper error responses

**Test 5a: Invalid Workflow ID**
```bash
curl ${BASE_URL}/api/workflows/invalid-id-12345/status
```

**Expected Response** (404 Not Found):
```json
{
  "error": "Workflow not found",
  "workflow_id": "invalid-id-12345"
}
```

**Test 5b: Missing Authentication**
```bash
curl -X POST ${BASE_URL}/api/workflows/${WORKFLOW_ID}/transition \
  -H "Content-Type: application/json" \
  -d '{"action":"advance","reason":"test"}'
```

**Expected Response** (401 Unauthorized):
```json
{
  "error": "API key required",
  "message": "Missing Authorization header"
}
```

**✅ Pass Criteria**:
- Proper HTTP status codes (404, 401)
- Descriptive error messages
- No server crashes

---

## Full Test Script

For convenience, you can run all tests with this script:

```bash
#!/bin/bash

# Smoke test script
BASE_URL="${BASE_URL:-http://localhost:3000}"
WORKFLOW_ID=""

echo "=== CCOrch Smoke Tests ==="
echo ""

# Test 1: Health Check
echo "Test 1: Health Check"
curl -s ${BASE_URL}/health | jq '.'
echo ""

# Test 2: Create Workflow
echo "Test 2: Create Workflow"
RESPONSE=$(curl -s -X POST ${BASE_URL}/hooks/user-prompt-submit \
  -H "Content-Type: application/json" \
  -H "X-Hook-Secret: ${HOOK_SECRET}" \
  -d '{
    "session_id": "smoke-test-'$(date +%s)'",
    "cwd": "/tmp",
    "prompt": "\\\\cco Implement smoke test workflow"
  }')

echo $RESPONSE | jq '.'
# Note: Hook response doesn't include workflowId in response body
# Check database for latest workflow
WORKFLOW_ID=$(sqlite3 dev.db "SELECT id FROM workflows ORDER BY created_at DESC LIMIT 1;")
echo "Workflow ID: $WORKFLOW_ID"
echo ""

# Test 3: Query Status
echo "Test 3: Query Workflow Status"
curl -s ${BASE_URL}/api/workflows/${WORKFLOW_ID}/status | jq '.'
echo ""

# Test 4: Manual Transition
echo "Test 4: Manual Transition"
curl -s -X POST ${BASE_URL}/api/workflows/${WORKFLOW_ID}/transition \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY_ADMIN}" \
  -d '{"action":"advance","reason":"Smoke test"}' | jq '.'
echo ""

echo "=== Smoke Tests Complete ==="
```

Save as `scripts/smoke-test.sh` and run:
```bash
chmod +x scripts/smoke-test.sh
./scripts/smoke-test.sh
```

---

## Cleanup

After smoke testing, you may want to clean up test data:

```bash
# Delete test workflows
sqlite3 dev.db "DELETE FROM workflows WHERE user_prompt LIKE '%smoke test%';"

# Or reset entire database (WARNING: deletes all data)
pnpm prisma migrate reset
```

---

## Troubleshooting

### Server Not Responding

1. Check if server is running: `pm2 status`
2. Check server logs: `pm2 logs ccorch`
3. Verify port is not blocked: `lsof -i :3000`

### Database Connection Failed

1. Check DATABASE_URL in .env
2. Verify database file exists and has proper permissions
3. Run migrations: `pnpm prisma migrate deploy`

### Authentication Failures

1. Verify API_KEY_ADMIN in .env matches test script
2. Check HOOK_SECRET matches between .env and Claude Code settings
3. Check Authorization header format: `Bearer <key>`

---

**Last Updated**: 2025-01-15
**Version**: 1.0
