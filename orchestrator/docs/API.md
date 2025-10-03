# API Reference

## Overview

The orchestrator HTTP server provides REST endpoints for managing workflow execution and coordinating with Claude Code through hook integration. The server runs on port 3001 (configurable via `ORCHESTRATOR_PORT`) and manages agent states through asynchronous task execution and file-based result storage.

## Base URL

```
http://localhost:3001
```

## Endpoints

### Server Management

#### POST /api/init
Initialize the orchestrator server with Claude integration callbacks.

**Request:**
```bash
curl -X POST http://localhost:3001/api/init
```

**Response:**
```json
{
  "status": "initialized",
  "message": "Orchestrator server initialized successfully"
}
```

#### GET /api/health
Check server health and initialization status.

**Request:**
```bash
curl -s http://localhost:3001/api/health
```

**Response (Uninitialized):**
```json
{
  "status": "uninitialized",
  "message": "Server running but orchestrator not initialized"
}
```

**Response (Initialized):**
```json
{
  "status": "initialized",
  "message": "Orchestrator server ready",
  "activeWorkflows": 2,
  "pendingTasks": 1
}
```

### Command Processing

#### POST /api/parse-command
Parse user commands to identify workflow type and extract task description.

**Request:**
```bash
curl -X POST http://localhost:3001/api/parse-command \
  -H "Content-Type: application/json" \
  -d '{
    "command": "Run debug-issue workflow: users cannot login"
  }'
```

**Response:**
```json
{
  "success": true,
  "parsed": {
    "workflowType": "debug-issue",
    "taskDescription": "users cannot login",
    "priority": "medium",
    "originalCommand": "Run debug-issue workflow: users cannot login"
  }
}
```

### Workflow Execution

#### POST /api/execute
Start workflow execution with task description and context.

**Request:**
```bash
curl -X POST http://localhost:3001/api/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflowType": "debug-issue",
    "taskDescription": "users cannot login",
    "context": {
      "priority": "high",
      "projectDirectory": "/path/to/project"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "workflowId": "wf_1758459087377_o8j98hgyqc",
  "message": "Workflow started successfully",
  "status": "running"
}
```

### Task Management

#### GET /api/next-task/{workflowId}
Get the next pending task for Claude to execute. Used by Claude to retrieve agent execution parameters.

**Request:**
```bash
curl -s http://localhost:3001/api/next-task/wf_1758459087377_o8j98hgyqc
```

**Response (Task Available):**
```json
{
  "taskId": "task_1758459123456_abc123",
  "params": {
    "subagent_type": "issue-detective",
    "description": "Investigate login issues",
    "prompt": "# Agent: issue-detective\n\n## Task Description:\nInvestigate users cannot login...\n\n## Context:\n..."
  }
}
```

**Response (No Tasks):**
```json
{
  "message": "No pending tasks for workflow"
}
```

#### POST /api/agent-result
Submit agent execution results to the server. Used by Claude Code to send agent results after task completion.

**Request:**
```bash
curl -X POST http://localhost:3001/api/agent-result \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "task_1758459123456_abc123",
    "result": "Investigation completed. Found authentication service issue...",
    "success": true,
    "agentType": "issue-detective"
  }'
```

**Response:**
```json
{
  "status": "received",
  "taskId": "task_1758459123456_abc123",
  "success": true,
  "workflowId": "wf_1758459087377_o8j98hgyqc",
  "nextTask": {
    "taskId": "task_1758459123457_def456",
    "params": {
      "subagent_type": "java-backend-developer",
      "description": "Implement fix for authentication issue",
      "prompt": "# Agent: java-backend-developer..."
    },
    "timestamp": "2024-01-15T10:35:00Z"
  }
}
```

### Todo Management

#### GET /api/todos/{workflowId}
Get all todo items for a specific workflow. Used by Claude Code for TodoWrite integration.

**Request:**
```bash
curl -s http://localhost:3001/api/todos/wf_1758459087377_o8j98hgyqc
```

**Response:**
```json
{
  "workflowId": "wf_1758459087377_o8j98hgyqc",
  "todos": [
    {
      "content": "Investigate login issues",
      "status": "completed",
      "activeForm": "Investigating login issues"
    },
    {
      "content": "Implement authentication fix",
      "status": "in_progress",
      "activeForm": "Implementing authentication fix"
    },
    {
      "content": "Run comprehensive tests",
      "status": "pending",
      "activeForm": "Running comprehensive tests"
    }
  ]
}
```

#### GET /api/next-todo/{workflowId}
Get the next pending todo item for a workflow.

**Request:**
```bash
curl -s http://localhost:3001/api/next-todo/wf_1758459087377_o8j98hgyqc
```

**Response:**
```json
{
  "workflowId": "wf_1758459087377_o8j98hgyqc",
  "nextTodo": {
    "content": "Run comprehensive tests",
    "status": "pending",
    "activeForm": "Running comprehensive tests"
  }
}
```

### Status and Monitoring

#### GET /api/status/{workflowId}
Get detailed workflow status and progress.

**Request:**
```bash
curl -s http://localhost:3001/api/status/wf_1758459087377_o8j98hgyqc
```

**Response:**
```json
{
  "workflowId": "wf_1758459087377_o8j98hgyqc",
  "workflowType": "debug-issue",
  "status": "running",
  "startTime": "2024-01-15T10:30:00Z",
  "taskDescription": "users cannot login",
  "projectDirectory": "/path/to/project",
  "completedTasks": [
    {
      "taskId": "task_1758459123456_abc123",
      "agentType": "issue-detective",
      "success": true,
      "completedAt": "2024-01-15T10:32:00Z"
    }
  ],
  "pendingTaskId": "task_1758459123457_def456",
  "pendingTasks": 2,
  "hasPendingTodos": true
}
```

#### GET /api/workflows
List all active workflows.

**Request:**
```bash
curl -s http://localhost:3001/api/workflows
```

**Response:**
```json
{
  "activeWorkflows": [
    {
      "workflowId": "wf_1758459087377_o8j98hgyqc",
      "workflowType": "debug-issue",
      "status": "running",
      "startTime": "2024-01-15T10:30:00Z",
      "taskDescription": "users cannot login"
    }
  ],
  "count": 1
}
```

### Debug and Recovery Endpoints

#### GET /api/debug/workflows
Get detailed information about all workflows for debugging purposes.

**Request:**
```bash
curl -s http://localhost:3001/api/debug/workflows
```

**Response:**
```json
{
  "workflows": [
    {
      "workflowId": "wf_1758459087377_o8j98hgyqc",
      "workflowType": "debug-issue",
      "status": "running",
      "startTime": "2024-01-15T10:30:00Z",
      "completedTasks": 1,
      "pendingTasks": 2
    }
  ],
  "pendingTasks": [
    {
      "taskId": "task_1758459123457_def456",
      "workflowId": "wf_1758459087377_o8j98hgyqc",
      "status": "awaiting_claude_execution",
      "agentType": "java-backend-developer"
    }
  ],
  "timestamp": "2024-01-15T10:35:00Z"
}
```

#### GET /api/debug/workflow/{id}
Get comprehensive debugging information for a specific workflow.

**Request:**
```bash
curl -s http://localhost:3001/api/debug/workflow/wf_1758459087377_o8j98hgyqc
```

**Response:**
```json
{
  "workflow": {
    "workflowId": "wf_1758459087377_o8j98hgyqc",
    "workflowType": "debug-issue",
    "status": "running",
    "startTime": "2024-01-15T10:30:00Z",
    "taskDescription": "users cannot login",
    "completedTasks": [...],
    "pendingTaskId": "task_1758459123457_def456"
  },
  "relatedTasks": [
    {
      "taskId": "task_1758459123456_abc123",
      "status": "completed",
      "agentType": "issue-detective"
    },
    {
      "taskId": "task_1758459123457_def456",
      "status": "awaiting_claude_execution",
      "agentType": "java-backend-developer"
    }
  ],
  "timestamp": "2024-01-15T10:35:00Z"
}
```

#### GET /api/debug/task/{taskId}
Get detailed information about a specific task.

**Request:**
```bash
curl -s http://localhost:3001/api/debug/task/task_1758459123456_abc123
```

**Response:**
```json
{
  "task": {
    "taskId": "task_1758459123456_abc123",
    "workflowId": "wf_1758459087377_o8j98hgyqc",
    "status": "completed",
    "createdTime": "2024-01-15T10:30:00Z",
    "completedTime": "2024-01-15T10:32:00Z",
    "params": {
      "subagent_type": "issue-detective",
      "description": "Investigate login issues",
      "prompt": "# Agent: issue-detective..."
    },
    "result": "Investigation completed. Found authentication service issue...",
    "success": true,
    "hasPromise": false,
    "hasTimeout": false
  },
  "workflow": {
    "workflowId": "wf_1758459087377_o8j98hgyqc",
    "status": "running"
  },
  "timestamp": "2024-01-15T10:35:00Z"
}
```

#### POST /api/recover-workflow/{workflowId}
Attempt to recover a workflow that may be stuck or in an inconsistent state.

**Request:**
```bash
curl -X POST http://localhost:3001/api/recover-workflow/wf_1758459087377_o8j98hgyqc \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response:**
```json
{
  "success": true,
  "message": "Workflow recovery completed",
  "workflowId": "wf_1758459087377_o8j98hgyqc",
  "actions": [
    "Cleared stuck pending tasks",
    "Reset workflow status to running",
    "Created next task in sequence"
  ]
}
```

#### POST /api/reset-task/{taskId}
Reset a task back to pending status, clearing any failure state.

**Request:**
```bash
curl -X POST http://localhost:3001/api/reset-task/task_1758459123456_abc123
```

**Response:**
```json
{
  "success": true,
  "message": "Task reset successfully",
  "taskId": "task_1758459123456_abc123",
  "oldStatus": "failed",
  "newStatus": "pending"
}
```

## Error Responses

### Standard Error Format
```json
{
  "error": {
    "code": "ORCH-EXEC-001",
    "message": "Agent execution timeout",
    "details": "Task exceeded 600000ms timeout",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

### Common Error Codes

- **400 Bad Request**: Invalid request parameters
- **404 Not Found**: Workflow or task not found
- **408 Request Timeout**: Task execution timeout
- **500 Internal Server Error**: Server or orchestration error

## Hook Integration

### UserPromptSubmit Hook Flow
1. Hook detects workflow command in user prompt (e.g., "run debug-issue workflow: users cannot login")
2. Calls `POST /api/init` to ensure server is ready
3. Calls `POST /api/parse-command` to validate command and extract workflow type/description
4. Calls `POST /api/execute` to start workflow execution
5. Injects structured context into Claude Code with workflow information and task parameters
6. Claude Code discovers and executes tasks via `GET /api/next-task/{workflowId}`

### Task Execution Flow
1. Claude Code calls `GET /api/next-task/{workflowId}` to get pending tasks
2. Claude Code executes the Task tool with provided agent parameters
3. Task completion triggers submission via `POST /api/agent-result`
4. Server processes result, saves to file system, and automatically creates next task in sequence
5. Process repeats until workflow is complete

### File-Based Result Management
- Each agent result is saved as structured JSON files
- Previous results are available to subsequent agents via file references
- Handover chains create context documents for agent-to-agent communication
- Results persist in workflow directories for debugging and recovery

## Configuration

### Environment Variables
- `ORCHESTRATOR_PORT`: Server port (default: 3001)
- `AGENT_EXECUTION_TIMEOUT`: Task timeout in milliseconds (default: 600000)

### Task Complexity and Thinking Levels
The orchestrator automatically detects task complexity from the description and applies appropriate thinking levels:

- **SIMPLE**: Basic tasks, prototypes, dummy implementations
- **MODERATE**: Standard implementation tasks with reasonable best practices
- **COMPLEX**: Production-ready implementations with full enterprise considerations

Thinking levels are passed to agents to guide their execution approach, with agents loading appropriate templates based on the detected complexity.

### Timeout Configuration
Task execution timeout can be configured via:
1. Environment variable: `AGENT_EXECUTION_TIMEOUT`
2. Server config: `ORCHESTRATOR_CONFIG.timeouts.claudeIntegration.agentExecutionTimeout`

## Usage Examples

### Complete Workflow Example
```bash
# 1. Start server
npm run server &

# 2. Initialize
curl -X POST http://localhost:3001/api/init

# 3. Start workflow
WORKFLOW_ID=$(curl -s -X POST http://localhost:3001/api/execute \
  -H "Content-Type: application/json" \
  -d '{"workflowType":"debug-issue","taskDescription":"login fails"}' | \
  jq -r '.workflowId')

# 4. Get next task (simulating Claude)
curl -s http://localhost:3001/api/next-task/$WORKFLOW_ID | jq

# 5. Submit result (simulating Claude Code agent completion)
curl -X POST http://localhost:3001/api/agent-result \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "task_xxx",
    "result": "Investigation completed",
    "success": true,
    "agentType": "issue-detective"
  }'

# 6. Check status
curl -s http://localhost:3001/api/status/$WORKFLOW_ID | jq
```

### Health Monitoring
```bash
# Continuous health check
watch -n 5 'curl -s http://localhost:3001/api/health | jq'

# Check for active workflows
curl -s http://localhost:3001/api/workflows | jq '.count'
```

### Debugging Workflows
```bash
# Get detailed debug information for all workflows
curl -s http://localhost:3001/api/debug/workflows | jq

# Debug a specific workflow
curl -s http://localhost:3001/api/debug/workflow/wf_1758459087377_o8j98hgyqc | jq

# Debug a specific task
curl -s http://localhost:3001/api/debug/task/task_1758459123456_abc123 | jq

# Recover a stuck workflow
curl -X POST http://localhost:3001/api/recover-workflow/wf_1758459087377_o8j98hgyqc

# Reset a failed task
curl -X POST http://localhost:3001/api/reset-task/task_1758459123456_abc123
```

### TodoWrite Integration
```bash
# Get all todos for a workflow
curl -s http://localhost:3001/api/todos/wf_1758459087377_o8j98hgyqc | jq

# Get the next pending todo
curl -s http://localhost:3001/api/next-todo/wf_1758459087377_o8j98hgyqc | jq
```

## Security Considerations

- Server binds to localhost by default (not exposed externally)
- No authentication required (local development server)
- Task results may contain sensitive project information
- Consider firewall rules if running in shared environments

## Performance Notes

- Server maintains in-memory state for active workflows and tasks
- Task queue managed via JavaScript Map for fast access
- File-based result storage with structured JSON for agent handovers
- Asynchronous task creation and result processing to minimize blocking
- Parallel file operations (directory creation, result saving, handover generation)
- Automatic workflow progression without blocking on individual task completion
- Configurable timeouts prevent hung workflows and tasks
- Optimized handover chain generation with file references instead of large string concatenation