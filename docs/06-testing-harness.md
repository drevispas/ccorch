# CCOrch Hook Test Harness

The Hook Test Harness provides tools for testing CCOrch's hook integration without requiring a running Claude Code instance. This enables faster development cycles, automated testing, and easier debugging.

## Overview

The test harness consists of three main components:

1. **Mock Claude Code Server** - Simulates Claude Code sending hook payloads to CCOrch
2. **Payload Sender** - CLI tool for sending hook payloads from JSON files
3. **Response Validator** - Validates hook responses conform to Claude Code format

## Prerequisites

- CCOrch running on `http://localhost:3000` (or configured via `CCORCH_URL`)
- Node.js and pnpm installed
- Hook secret configured (defaults to `test-hook-secret`)

## Quick Start

### 1. Start CCOrch

```bash
pnpm dev
```

CCOrch should be running on port 3000.

### 2. Send a Test Payload

```bash
# Send a UserPromptSubmit hook
pnpm harness:send user-prompt-submit tests/fixtures/user-prompt-submit-backend.json

# Send a PostToolUse hook with agent results
pnpm harness:send post-tool-use tests/fixtures/post-tool-use-architect.json
```

### 3. Validate a Response

```bash
# Validate a response file
pnpm harness:validate tests/fixtures/response-agent-injection.json

# Validate from stdin
echo '{"message": "Use backend-architect-moderate..."}' | pnpm harness:validate --stdin
```

## Components

### Mock Claude Code Server

**File**: `tests/harness/mock-claude-server.ts`

A lightweight HTTP server that simulates Claude Code sending hook payloads to CCOrch.

#### Starting the Mock Server

```bash
pnpm harness:mock
```

Server runs on port 4000 by default.

#### Available Endpoints

**POST /trigger/user-prompt-submit**
```bash
curl -X POST http://localhost:4000/trigger/user-prompt-submit \
  -H "Content-Type: application/json" \
  -d '{"prompt": "\\cco Implement REST API for authentication"}'
```

**POST /trigger/post-tool-use**
```bash
curl -X POST http://localhost:4000/trigger/post-tool-use \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "wf-123",
    "agentRole": "backend-architect",
    "complexity": "moderate",
    "stepNumber": 0,
    "results": {
      "summary": "Designed authentication API",
      "design": "JWT-based with refresh tokens"
    }
  }'
```

**POST /trigger/stop**
```bash
curl -X POST http://localhost:4000/trigger/stop
```

**GET /health**
```bash
curl http://localhost:4000/health
```

#### Environment Variables

- `CCORCH_URL` - CCOrch server URL (default: `http://localhost:3000`)
- `HOOK_SECRET` - Shared secret for hook authentication (default: `test-hook-secret`)

### Payload Sender

**File**: `tests/harness/send-payload.ts`

CLI tool for sending hook payloads from JSON files to CCOrch.

#### Usage

```bash
pnpm harness:send <hook-name> <payload-file.json>
```

#### Supported Hooks

- `user-prompt-submit` - User submits a prompt
- `post-tool-use` - Agent completes and returns results
- `stop` - Workflow cleanup hook

#### Examples

```bash
# Backend development workflow
pnpm harness:send user-prompt-submit tests/fixtures/user-prompt-submit-backend.json

# Frontend development workflow
pnpm harness:send user-prompt-submit tests/fixtures/user-prompt-submit-frontend.json

# Debug workflow
pnpm harness:send user-prompt-submit tests/fixtures/user-prompt-submit-debug.json

# Agent completion
pnpm harness:send post-tool-use tests/fixtures/post-tool-use-architect.json

# Stop hook
pnpm harness:send stop tests/fixtures/stop-hook.json
```

#### Environment Variables

- `CCORCH_URL` - CCOrch server URL (default: `http://localhost:3000`)
- `HOOK_SECRET` - Shared secret for hook authentication (default: `test-hook-secret`)

### Response Validator

**File**: `tests/harness/validate-response.ts`

Validates hook responses conform to Claude Code hook specification.

#### Usage

```bash
# Validate from file
pnpm harness:validate <response-file.json>

# Validate from stdin
echo '{"message": "..."}' | pnpm harness:validate --stdin
```

#### Examples

```bash
# Validate agent injection response
pnpm harness:validate tests/fixtures/response-agent-injection.json

# Validate workflow completion response
pnpm harness:validate tests/fixtures/response-workflow-complete.json

# Pipe from curl
curl http://localhost:3000/hooks/user-prompt-submit \
  -H "X-Hook-Secret: test-hook-secret" \
  -d @tests/fixtures/user-prompt-submit-backend.json \
  | pnpm harness:validate --stdin
```

#### Validation Rules

The validator checks:

- **JSON structure**: Valid JSON with correct fields
- **Required fields**: Based on hook type
- **Message format**: For agent injections and workflow completion
- **Agent roles**: Valid agent role names
- **Complexity levels**: Valid complexity levels (simple/moderate/complex)

## Sample Payload Files

The `tests/fixtures/` directory contains sample payloads for testing:

### UserPromptSubmit Payloads

- `user-prompt-submit-backend.json` - Backend development task
- `user-prompt-submit-frontend.json` - Frontend development task
- `user-prompt-submit-debug.json` - Debug workflow task

### PostToolUse Payloads

- `post-tool-use-architect.json` - Backend architect agent results

### Stop Hook Payloads

- `stop-hook.json` - Stop hook payload

### Sample Responses

- `response-agent-injection.json` - Agent injection response
- `response-workflow-complete.json` - Workflow completion response

## Example Test Flows

### Full Backend Development Workflow

```bash
# Terminal 1: Start CCOrch
pnpm dev

# Terminal 2: Run test flow

# Step 1: Submit user prompt (initiates workflow)
pnpm harness:send user-prompt-submit tests/fixtures/user-prompt-submit-backend.json

# Response should contain agent injection for backend-architect-moderate

# Step 2: Simulate backend-architect completion
# (Update workflow_id in fixture with actual ID from step 1)
pnpm harness:send post-tool-use tests/fixtures/post-tool-use-architect.json

# Response should contain next agent injection for backend-developer-moderate

# Step 3: Continue with additional agents as needed...
```

### Quick Validation Test

```bash
# Test UserPromptSubmit endpoint and validate response
curl -X POST http://localhost:3000/hooks/user-prompt-submit \
  -H "Content-Type: application/json" \
  -H "X-Hook-Secret: test-hook-secret" \
  -d @tests/fixtures/user-prompt-submit-backend.json \
  | pnpm harness:validate --stdin
```

### Using Mock Server

```bash
# Terminal 1: Start CCOrch
pnpm dev

# Terminal 2: Start mock server
pnpm harness:mock

# Terminal 3: Trigger via mock server API
curl -X POST http://localhost:4000/trigger/user-prompt-submit \
  -H "Content-Type: application/json" \
  -d '{"prompt": "\\cco Implement user authentication"}'

# Mock server will:
# 1. Generate proper hook payload
# 2. Send to CCOrch
# 3. Display CCOrch's response
```

## Creating Custom Payloads

### UserPromptSubmit Payload

**⚠️ Important**: Prompts must include `\cco` or `\c2o` trigger prefix for orchestration. Without a trigger, orchestration will be skipped and no workflow will be created.

```json
{
  "session_id": "unique-session-id",
  "transcript_path": "/path/to/transcript.json",
  "cwd": "/path/to/project",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "\\cco Your task description here"
}
```

### PostToolUse Payload

**Important**: PostToolUse payloads come from Claude Code after Task tool execution. Agent results are in `tool_response.stdout` as plain text. The orchestrator extracts the agent role from `tool_input.subagent_type` and finds the workflow by matching `session_id`.

```json
{
  "session_id": "unique-session-id",
  "transcript_path": "/path/to/transcript.json",
  "cwd": "/path/to/project",
  "hook_event_name": "PostToolUse",
  "tool_name": "Task",
  "tool_input": {
    "subagent_type": "backend-architect-moderate",
    "prompt": "Use the backend-architect-moderate subagent to design authentication API",
    "description": "Architecture design task"
  },
  "tool_response": {
    "stdout": "# Architecture Design\n\nDesigned authentication API with JWT tokens...\n\n## Components\n- Auth controller\n- Token service\n- User repository\n\n## Security Considerations\n- HTTPS only\n- Token expiration\n...",
    "stderr": "",
    "interrupted": false,
    "isImage": false
  }
}
```

### Stop Payload

```json
{
  "session_id": "unique-session-id",
  "transcript_path": "/path/to/transcript.json",
  "cwd": "/path/to/project",
  "hook_event_name": "Stop"
}
```

## Troubleshooting

### Connection Refused

```
Error: connect ECONNREFUSED 127.0.0.1:3000
```

**Solution**: Make sure CCOrch is running on port 3000:
```bash
pnpm dev
```

### Authentication Failed (401)

```
Status: 401 Unauthorized
```

**Solution**: Check that `HOOK_SECRET` environment variable matches CCOrch configuration:
```bash
export HOOK_SECRET=your-secret-here
pnpm harness:send user-prompt-submit tests/fixtures/user-prompt-submit-backend.json
```

### Invalid Response Format

```
❌ Invalid hook response
```

**Solution**: Use the validator to see specific errors:
```bash
pnpm harness:validate response.json
```

## Integration with Automated Tests

The test harness can be used in automated integration tests:

```typescript
import { sendPayload } from '../harness/send-payload';
import { validateHookResponse } from '../harness/validate-response';

describe('Hook Integration Tests', () => {
  it('should handle UserPromptSubmit correctly', async () => {
    const payload = {
      session_id: 'test-123',
      hook_event_name: 'UserPromptSubmit',
      prompt: 'Implement REST API',
      // ... other required fields
    };

    const response = await sendPayload('user-prompt-submit', payload);
    const validation = validateHookResponse(response);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });
});
```

## NPM Scripts Reference

| Script | Command | Description |
|--------|---------|-------------|
| `harness:mock` | `tsx tests/harness/mock-claude-server.ts` | Start mock Claude Code server |
| `harness:send` | `tsx tests/harness/send-payload.ts` | Send payload from JSON file |
| `harness:validate` | `tsx tests/harness/validate-response.ts` | Validate hook response |

## Best Practices

1. **Use fixtures for common scenarios** - Create reusable JSON files for typical workflows
2. **Validate responses** - Always validate responses to ensure correct format
3. **Environment isolation** - Use separate `.env` files for test vs production
4. **Automated testing** - Integrate harness into CI/CD pipelines
5. **Document custom payloads** - Add comments in JSON files explaining the test scenario

## See Also

- [Claude Code Hooks Documentation](https://docs.claude.com/en/docs/claude-code/hooks.md)
- [CCOrch API Reference](./technical-spec.md#3-api-interface)
- [Hook Integration Guide](./architecture.md#2-sequence-flows)
