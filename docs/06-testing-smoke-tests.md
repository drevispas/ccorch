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

**Setup**: Create test payload file `test-payload.json`:
```json
{
  "hookName": "UserPromptSubmit",
  "userPrompt": "Implement user authentication API",
  "conversationId": "test-conv-123",
  "timestamp": 1705315800000
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
  "workflowId": "<uuid>",
  "message": "Agent prompt injected successfully",
  "agentPrompt": "<detailed-prompt>"
}
```

**✅ Pass Criteria**:
- HTTP status code is 200
- Response includes `workflowId`
- Response includes `agentPrompt`

**Verify in Database**:
```bash
# Open Prisma Studio
pnpm prisma studio

# Or query directly
sqlite3 dev.db "SELECT id, chain_name, complexity, status FROM workflows ORDER BY created_at DESC LIMIT 1;"
```

**Expected Database State**:
- New workflow record exists
- `status` is either "PENDING_COMPLEXITY" or "ACTIVE"
- `chain_name` is one of the valid chains (e.g., "backend-development")

---

### Test 3: Submit Agent Result

**Objective**: Verify agent result submission and workflow advancement

**Prerequisites**: Use `workflowId` from Test 2

**Setup**: Create agent result payload `agent-result.json`:
```json
{
  "agentRole": "backend-architect",
  "complexity": "moderate",
  "stepNumber": 0,
  "results": {
    "summary": "Architecture designed for authentication API",
    "design": "RESTful API with JWT tokens, bcrypt password hashing"
  },
  "status": "COMPLETED"
}
```

**Execute**:
```bash
WORKFLOW_ID="<workflow-id-from-test-2>"

curl -X POST ${BASE_URL}/api/workflows/${WORKFLOW_ID}/results \
  -H "Content-Type: application/json" \
  -d @agent-result.json
```

**Expected Response** (200 OK):
```json
{
  "message": "Result stored and workflow advanced",
  "workflowId": "<workflow-id>",
  "currentStep": 1,
  "nextAgent": "java-backend-developer"
}
```

**✅ Pass Criteria**:
- HTTP status code is 200
- `currentStep` is incremented
- `nextAgent` matches expected next agent in chain

**Verify in Database**:
```bash
sqlite3 dev.db "SELECT id, current_step, status FROM workflows WHERE id = '<workflow-id>';"
sqlite3 dev.db "SELECT agent_role, step_number, status FROM agent_results WHERE workflow_id = '<workflow-id>';"
```

**Expected Database State**:
- Workflow `current_step` is 1 (incremented)
- Agent result record exists with status "COMPLETED"

---

### Test 4: Query Workflow Status

**Objective**: Verify workflow status retrieval

**Execute**:
```bash
WORKFLOW_ID="<workflow-id-from-test-2>"

curl ${BASE_URL}/api/workflows/${WORKFLOW_ID}/status
```

**Expected Response** (200 OK):
```json
{
  "id": "<workflow-id>",
  "status": "ACTIVE",
  "chainName": "backend-development",
  "complexity": "moderate",
  "currentStep": 1,
  "agentSequence": ["backend-architect", "java-backend-developer", "code-reviewer"],
  "createdAt": "<timestamp>",
  "updatedAt": "<timestamp>"
}
```

**✅ Pass Criteria**:
- HTTP status code is 200
- All expected fields are present
- `status` is "ACTIVE"
- `currentStep` matches database

---

### Test 5: Manual Transition (Admin API)

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
  "id": "<workflow-id>",
  "status": "ACTIVE",
  "currentStep": 2,
  "message": "Workflow advanced to step 2"
}
```

**✅ Pass Criteria**:
- HTTP status code is 200
- `currentStep` is incremented (should be 2)
- Transition is logged

**Verify Audit Log**:
```bash
sqlite3 dev.db "SELECT from_step, to_step, from_agent, to_agent, reason FROM workflow_transitions WHERE workflow_id = '<workflow-id>' ORDER BY transitioned_at DESC LIMIT 1;"
```

**Expected Audit Log**:
- New transition record exists
- `from_step` is 1, `to_step` is 2
- `reason` contains "Smoke test: manual advancement"

---

### Test 6: Error Handling

**Objective**: Verify proper error responses

**Test 6a: Invalid Workflow ID**
```bash
curl ${BASE_URL}/api/workflows/invalid-id-12345/status
```

**Expected Response** (404 Not Found):
```json
{
  "error": "Workflow not found",
  "workflowId": "invalid-id-12345"
}
```

**Test 6b: Missing Authentication**
```bash
curl -X POST ${BASE_URL}/api/workflows/${WORKFLOW_ID}/transition \
  -H "Content-Type: application/json" \
  -d '{"action":"advance","reason":"test"}'
```

**Expected Response** (401 Unauthorized):
```json
{
  "error": "Unauthorized",
  "message": "Missing or invalid API key"
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
    "hookName": "UserPromptSubmit",
    "userPrompt": "Implement smoke test workflow",
    "conversationId": "smoke-test-'$(date +%s)'",
    "timestamp": '$(date +%s%3N)'
  }')

echo $RESPONSE | jq '.'
WORKFLOW_ID=$(echo $RESPONSE | jq -r '.workflowId')
echo "Workflow ID: $WORKFLOW_ID"
echo ""

# Test 3: Submit Agent Result
echo "Test 3: Submit Agent Result"
curl -s -X POST ${BASE_URL}/api/workflows/${WORKFLOW_ID}/results \
  -H "Content-Type: application/json" \
  -d '{
    "agentRole": "backend-architect",
    "complexity": "simple",
    "stepNumber": 0,
    "results": {"summary": "Smoke test result"},
    "status": "COMPLETED"
  }' | jq '.'
echo ""

# Test 4: Query Status
echo "Test 4: Query Workflow Status"
curl -s ${BASE_URL}/api/workflows/${WORKFLOW_ID}/status | jq '.'
echo ""

# Test 5: Manual Transition
echo "Test 5: Manual Transition"
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
