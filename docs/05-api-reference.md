# CCOrch API Reference

**Version:** 1.0.0
**Base URL:** `http://localhost:3000`

This document provides comprehensive API documentation for the Claude Code Orchestrator (CCOrch) HTTP endpoints.

## Table of Contents

- [Authentication](#authentication)
  - [Admin Endpoints](#admin-endpoints)
  - [Public Endpoints](#public-endpoints)
  - [Agent Result Submission](#agent-result-submission)
- [Endpoints](#endpoints)
  - [GET /api/workflows/:id/status](#get-apiworkflowsidstatus)
  - [POST /api/workflows/:id/transition](#post-apiworkflowsidtransition)
- [Error Responses](#error-responses)
  - [400 Bad Request](#400-bad-request)
  - [401 Unauthorized](#401-unauthorized)
  - [403 Forbidden](#403-forbidden)
  - [404 Not Found](#404-not-found)
  - [500 Internal Server Error](#500-internal-server-error)
- [Workflow States](#workflow-states)
- [Agent Chains](#agent-chains)
- [Rate Limits](#rate-limits)
- [Versioning](#versioning)
- [Support](#support)

---

## Authentication

CCOrch uses different authentication schemes for admin and public endpoints:

### Admin Endpoints

**Authentication Required:** API Key (Bearer token)

Admin endpoints require authentication via the `Authorization` header with a Bearer token scheme:

```http
Authorization: Bearer <API_KEY_ADMIN>
```

The API key is configured via the `API_KEY_ADMIN` environment variable.

**Admin Endpoints:**
- `POST /api/workflows/:id/transition` - Manual workflow control

### Public Endpoints

**Authentication Required:** None

Public endpoints are accessible without authentication:

**Public Endpoints:**
- `GET /api/workflows/:id/status` - Query workflow status

### Agent Result Submission

**Note:** Agent results are submitted via the **PostToolUse hook** (not REST API). After each agent execution, Claude Code sends results through the configured hook endpoint (`POST /hooks/post-tool-use`) with HMAC authentication. Developers do not need to manually submit agent results.

---

## Endpoints

### GET /api/workflows/:id/status

Query the current status and progress of a workflow.

**Authentication:** Public (no auth required)

**URL Parameters:**
- `id` (string, required) - Workflow UUID

**Response:** `200 OK`

```json
{
  "workflow_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "ACTIVE",
  "chain_name": "backend-development",
  "complexity": "moderate",
  "current_step": 1,
  "total_steps": 3,
  "completed_agents": [
    {
      "role": "backend-architect",
      "step": 0,
      "status": "COMPLETED",
      "completed_at": 1704067200000
    }
  ],
  "summary": "Workflow is in progress. Step 1 of 3 (backend-developer) is next."
}
```

**Response Fields:**
- `workflow_id` - Workflow UUID
- `status` - Workflow state: `ACTIVE`, `COMPLETED`, or `FAILED`
- `chain_name` - Agent chain (e.g., `backend-development`, `frontend-development`)
- `complexity` - Task complexity: `simple`, `moderate`, or `complex`
- `current_step` - Current step index (0-based)
- `total_steps` - Total number of steps in the chain
- `completed_agents` - Array of completed agent executions
  - `role` - Agent role (e.g., `backend-architect`, `backend-developer`)
  - `step` - Step number (0-based)
  - `status` - Agent status: `COMPLETED`, `FAILED`, or `SKIPPED`
  - `completed_at` - Unix timestamp (milliseconds)
- `summary` - Human-readable workflow progress summary

**Error Responses:**

`400 Bad Request` - Invalid workflow ID format
```json
{
  "error": "Invalid workflow ID: Invalid uuid"
}
```

`404 Not Found` - Workflow does not exist
```json
{
  "error": "Workflow not found",
  "workflow_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**curl Example:**

```bash
# Query workflow status
curl http://localhost:3001/api/workflows/550e8400-e29b-41d4-a716-446655440000/status
```

---

### POST /api/workflows/:id/transition

Manually control workflow state transitions (admin only).

**Authentication:** API Key (Bearer token) required

**URL Parameters:**
- `id` (string, required) - Workflow UUID

**Request Body:**

```json
{
  "action": "advance",
  "reason": "Manually advancing to next step"
}
```

**Request Fields:**
- `action` (string, required) - Transition action: `advance`, `fail`, `retry`, or `skip`
- `reason` (string, required) - Audit reason for the transition (min 1 char)

**Actions:**

#### 1. `advance` - Move to Next Step

Advances the workflow to the next step. If advancing past the final step, marks workflow as `COMPLETED`.

**Request:**
```json
{
  "action": "advance",
  "reason": "Agent completed successfully, moving forward"
}
```

**Response:** `200 OK`
```json
{
  "workflow_id": "550e8400-e29b-41d4-a716-446655440000",
  "previous_step": 0,
  "current_step": 1,
  "status": "ACTIVE",
  "next_agent": "backend-developer-moderate",
  "message": "Workflow advanced to step 1"
}
```

#### 2. `fail` - Mark Workflow as Failed

Marks the workflow as `FAILED` and stops the chain. Step remains unchanged.

**Request:**
```json
{
  "action": "fail",
  "reason": "Irrecoverable error detected in architecture"
}
```

**Response:** `200 OK`
```json
{
  "workflow_id": "550e8400-e29b-41d4-a716-446655440000",
  "previous_step": 0,
  "current_step": 0,
  "status": "FAILED",
  "next_agent": null,
  "message": "Workflow marked as failed at step 0"
}
```

#### 3. `retry` - Retry Current Step

Deletes the last agent result and retries the current step. Step number remains unchanged.

**Request:**
```json
{
  "action": "retry",
  "reason": "Agent output was incorrect, retrying step"
}
```

**Response:** `200 OK`
```json
{
  "workflow_id": "550e8400-e29b-41d4-a716-446655440000",
  "previous_step": 1,
  "current_step": 1,
  "status": "ACTIVE",
  "next_agent": "backend-developer-moderate",
  "message": "Last agent result cleared. Ready to retry step 1"
}
```

#### 4. `skip` - Skip Current Step

Creates a `SKIPPED` agent result and advances to the next step.

**Request:**
```json
{
  "action": "skip",
  "reason": "Skipping architect step for testing"
}
```

**Response:** `200 OK`
```json
{
  "workflow_id": "550e8400-e29b-41d4-a716-446655440000",
  "previous_step": 0,
  "current_step": 1,
  "status": "ACTIVE",
  "next_agent": "backend-developer-moderate",
  "message": "Step 0 skipped. Workflow advanced to step 1"
}
```

**Response Fields:**
- `workflow_id` - Workflow UUID
- `previous_step` - Step before transition
- `current_step` - Step after transition
- `status` - Updated workflow status
- `next_agent` - Next agent to execute (null if workflow completed/failed)
- `message` - Human-readable transition summary

**Error Responses:**

`400 Bad Request` - Invalid action
```json
{
  "error": "Invalid enum value. Expected 'advance' | 'fail' | 'retry' | 'skip', received 'invalid-action'"
}
```

`400 Bad Request` - Missing reason
```json
{
  "error": "Validation error",
  "details": [
    {
      "field": "reason",
      "message": "Required"
    }
  ]
}
```

`401 Unauthorized` - Missing API key
```json
{
  "error": "API key required",
  "message": "Missing Authorization header"
}
```

`403 Forbidden` - Invalid API key
```json
{
  "error": "Invalid API key",
  "message": "Provided API key is not authorized"
}
```

`404 Not Found` - Workflow does not exist
```json
{
  "error": "Workflow not found",
  "workflow_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**curl Examples:**

```bash
# Advance workflow to next step
curl -X POST http://localhost:3001/api/workflows/550e8400-e29b-41d4-a716-446655440000/transition \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "advance",
    "reason": "Agent completed successfully"
  }'

# Mark workflow as failed
curl -X POST http://localhost:3001/api/workflows/550e8400-e29b-41d4-a716-446655440000/transition \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "fail",
    "reason": "Irrecoverable error detected"
  }'

# Retry current step
curl -X POST http://localhost:3001/api/workflows/550e8400-e29b-41d4-a716-446655440000/transition \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "retry",
    "reason": "Agent output was incorrect"
  }'

# Skip current step
curl -X POST http://localhost:3001/api/workflows/550e8400-e29b-41d4-a716-446655440000/transition \
  -H "Authorization: Bearer your-admin-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "skip",
    "reason": "Skipping for testing"
  }'
```

---

## Error Responses

CCOrch uses standard HTTP status codes with consistent JSON error responses.

### 400 Bad Request

**Cause:** Invalid request data (malformed UUID, invalid action, missing fields)

**Zod Validation Error:**
```json
{
  "error": "Validation error",
  "details": [
    {
      "field": "reason",
      "message": "String must contain at least 1 character(s)"
    }
  ]
}
```

**General Validation Error:**
```json
{
  "error": "Invalid workflow ID: Invalid uuid"
}
```

### 401 Unauthorized

**Cause:** Missing or malformed Authorization header

```json
{
  "error": "API key required",
  "message": "Missing Authorization header"
}
```

```json
{
  "error": "API key required",
  "message": "Invalid Authorization header format. Expected: Bearer <key>"
}
```

### 403 Forbidden

**Cause:** Invalid API key

```json
{
  "error": "Invalid API key",
  "message": "Provided API key is not authorized"
}
```

### 404 Not Found

**Cause:** Workflow does not exist

```json
{
  "error": "Workflow not found",
  "workflow_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

```json
{
  "error": "Not found",
  "message": "Resource does not exist"
}
```

### 500 Internal Server Error

**Cause:** Unexpected server error (logged with stack trace)

```json
{
  "error": "Internal server error",
  "message": "Database connection failed"
}
```

**Default message when error details unavailable:**
```json
{
  "error": "Internal server error",
  "message": "An unexpected error occurred"
}
```

---

## Workflow States

| Status | Description |
|--------|-------------|
| `ACTIVE` | Workflow is currently executing |
| `COMPLETED` | Workflow finished successfully |
| `FAILED` | Workflow encountered an irrecoverable error |

---

## Agent Chains

CCOrch supports the following pre-defined agent chains:

| Chain Name | Agent Sequence |
|------------|----------------|
| `backend-development` | backend-architect → java-backend-developer → code-reviewer |
| `frontend-development` | frontend-architect → nextjs-react-developer → code-reviewer |
| `debug` | issue-detective → (java-backend/nextjs-react)-developer → code-reviewer |
| `review` | code-reviewer → (java-backend/nextjs-react)-developer |
| `backend-design-only` | backend-architect |
| `frontend-design-only` | frontend-architect |
| `backend-only` | java-backend-developer |
| `frontend-only` | nextjs-react-developer |
| `review-only` | code-reviewer |
| `debug-only` | issue-detective |

Each chain step executes with the specified complexity level (`simple`, `moderate`, or `complex`).

---

## Rate Limits

**Current Version:** No rate limits enforced

---

## Versioning

**Current Version:** 1.0.0

CCOrch follows semantic versioning. Breaking changes will increment the major version.

---

## Support

For issues or questions:
- **GitHub Issues:** [drevispas/ccorch](https://github.com/drevispas/ccorch/issues)
- **Documentation:** See `/docs` directory in repository
