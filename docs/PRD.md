# Product Requirements Document: Claude Code Orchestrator

> **Document Concern**: WHAT and WHY (product managers, stakeholders)
>
> This document defines the product vision, requirements, and business logic. For technical implementation details, see `technical-spec.md`. For system architecture diagrams, see `architecture.md`.

**Related Documents**:
- `PRD.md` - Product requirements (WHAT and WHY)
- `technical-spec.md` - Technical implementation details (HOW)
- `architecture.md` - System architecture and sequence diagrams (STRUCTURE)
- `development-plan.md` - Implementation phases and timeline (WHEN)
- `WBS.md` - Granular work breakdown (TASKS)

## Table of Contents

1. [Overview](#1-overview)
2. [Goals](#2-goals)
3. [Prerequisites](#3-prerequisites)
   - [Agent Definitions](#31-agent-definitions)
   - [Runtime Requirements](#32-runtime-requirements)
4. [User Workflow](#4-user-workflow)
   - [User Interaction Flow](#41-user-interaction-flow)
   - [Workflow Chains](#42-workflow-chains)
5. [Orchestrator Responsibilities](#5-orchestrator-responsibilities)
   - [Hook Processing](#51-hook-processing)
   - [Action Determination Logic](#52-action-determination-logic)
   - [State Management](#53-state-management)
   - [API Interface](#54-api-interface)
6. [Hook Response Format](#6-hook-response-format)
   - [UserPromptSubmit Hook Response](#61-userpromptsubmit-hook-response)
   - [PostToolUse Hook Response](#62-posttooluse-hook-response)
7. [Example Workflow](#7-example-workflow)
8. [Non-Functional Requirements](#8-non-functional-requirements)
   - [Performance](#81-performance)
   - [Reliability](#82-reliability)
   - [Observability](#83-observability)
9. [Future Considerations](#9-future-considerations)
10. [References](#10-references)

## 1. Overview

The Claude Code Orchestrator (CCOrch) is an intelligent agent coordination system that intercepts Claude Code (CC) interactions via hooks and orchestrates multi-agent workflows based on task complexity and role requirements.

## 2. Goals

- Automate the selection and sequencing of specialized CC subagents
- Enable complex multi-step workflows without manual agent switching
- Optimize agent complexity levels based on task requirements
- Maintain workflow state across agent transitions

## 3. Prerequisites

### 3.1 Agent Definitions

Agent definition files stored in `.claude/agents/` with two dimensions:

**Roles:**
- `architect` - System design and architecture (design only, no implementation)
- `backend-developer` - Backend implementation
- `frontend-developer` - Frontend implementation
- `reviewer` - Code review (reviews unstaged and staged changes)
- `debugger` - Debugging and issue resolution

**Complexity Levels:**
- `simple` - Max 8 lines, straightforward tasks
- `moderate` - Max 20 lines, balanced approach
- `complex` - Max 50 lines, enterprise-grade considerations

**Agent Files:**
```
architect-{simple,moderate,complex}.md
backend-developer-{simple,moderate,complex}.md
frontend-developer-{simple,moderate,complex}.md
reviewer-{simple,moderate,complex}.md
debugger-{simple,moderate,complex}.md
```

### 3.2 Runtime Requirements

- Orchestrator API server running and accessible
- Claude Code with hook configuration enabled

## 4. User Workflow

### 4.1 User Interaction Flow

1. **User initiates**: Access Claude Code via terminal, submit task prompt
   - Examples: "design architecture", "implement backend", "review changes", "debug code"

2. **Hook emission**: CC emits `UserPromptSubmit` hook → CCOrch receives and processes

3. **Workflow planning**: CCOrch determines action chain and complexity level

4. **First agent injection**: CCOrch responds with injected prompt for first agent

5. **Agent execution**: CC executes agent → Agent completes

6. **Transition decision**: Agent completion triggers `PostToolUse` hook → CCOrch receives agent results in hook payload → CCOrch determines next agent

7. **Chain continuation**: CCOrch injects next agent prompt in hook response → Process repeats until all agents in chain complete

8. **Workflow completion**: Final agent completion triggers workflow end

---

### 4.2 Workflow Chains

| Chain Name             | Agent Sequence                                                  |
|------------------------|-----------------------------------------------------------------|
| `backend-development`  | architect → backend-developer → reviewer                        |
| `frontend-development` | architect → frontend-developer → reviewer                       |
| `debug`                | debugger → backend-developer OR frontend-developer → reviewer   |
| `review`               | reviewer → backend-developer OR frontend-developer              |
| `design-only`          | architect                                                       |
| `backend-only`         | backend-developer                                               |
| `frontend-only`        | frontend-developer                                              |
| `review-only`          | reviewer                                                        |
| `debug-only`           | debugger                                                        |

---

#### Backend vs Frontend Selection Strategy

When a chain offers both `backend-developer` and `frontend-developer` options (debug/review chains), the orchestrator uses **keyword analysis** to determine the appropriate role:

**Backend Keywords**:
`java`, `api`, `database`, `controller`, `service`, `repository`, `junit`, `rest`, `endpoint`, `sql`

**Frontend Keywords**:
`ui`, `ux`, `component`, `home`, `page`, `typescript`, `web`, `react`, `vue`, `css`, `html`, `button`

**Default**: If ambiguous or no clear signals → **backend-developer**

## 5. Orchestrator Responsibilities

### 5.1 Hook Processing

| Hook               | Purpose                  | CCOrch Action                                                                     |
|--------------------|--------------------------|-----------------------------------------------------------------------------------|
| `UserPromptSubmit` | User initiates task      | Parse intent, determine chain and complexity, inject first agent prompt           |
| `PostToolUse`      | Agent completes work     | Receive results in hook payload, determine next agent, inject next prompt OR end workflow |
| `Stop`             | Each prompt completes    | Cleanup: Mark stale ACTIVE workflows as FAILED (orphan detection)                 |

**Rationale**:
- **`UserPromptSubmit`**: Entry point for workflow initiation
- **`PostToolUse`**: Fires when subagent finishes task. Coordination point between agents in chain - receives agent results in hook payload, determines next agent, injects prompt synchronously
- **`Stop`**: Fires after **each agent completion** (not just session end). Used only for cleanup of truly orphaned workflows (stale timestamps), not for chain completion logic. No message injection.
- **Not needed**: `PreToolUse` - not required for core orchestration

**Important**: The `Stop` hook fires alongside `PostToolUse` after every agent execution. It is NOT an indicator of chain completion or session termination. Use `PostToolUse` for all chain continuation/completion decisions.

---

### 5.2 Action Determination Logic

#### Step 1: Parse User Intent
- Extract action type from user prompt
- Identify roles involved: `architect`, `backend`, `frontend`, `reviewer`, `debugger`

#### Step 2: Determine Chain
- Map action to predefined chain (see [section 4.2](#42-workflow-chains))

#### Step 3: Determine Complexity
Analyze task scope, requirements, and constraints. Select: `simple`, `moderate`, or `complex`

**Complexity Scoring Rubric**:

| Factor       | Simple                  | Moderate              | Complex                   |
|--------------|-------------------------|-----------------------|---------------------------|
| Scope        | Single file/function    | 2-5 files             | Multi-module/system-wide  |
| Dependencies | No external services    | 1-2 integrations      | Multiple services/APIs    |
| Risk         | No breaking changes     | Backward compatible   | Schema/API changes        |

**Keyword Modifiers**:

- **Simple**: `simple`, `quick`, `small`, `fix`, `add`, `rename`, `dummy`, `draft`, `easy`, `basic`, `single`
- **Complex**: `whole`, `complete`, `huge`, `large`, `totally`, `design`, `architect`, `refactor`, `migrate`, `enterprise`, `system-wide`, `full`
- **Default**: If no clear signals or keywords cancel out → **moderate**

**Example Prompts by Complexity**:

| Complexity | Example Prompts |
|------------|-----------------|
| **Simple** | • "Add validation to email field"<br>• "Fix typo in error message"<br>• "Rename variable getUserId to fetchUserId" |
| **Moderate** | • "Implement JWT authentication endpoint"<br>• "Add pagination to user list API"<br>• "Create user profile component" |
| **Complex** | • "Design microservices architecture for order system"<br>• "Refactor monolith to event-driven system"<br>• "Implement complete OAuth2 flow" |

#### Step 4: Assemble Agent Tasks
For each agent in chain:
- Define specific tasks based on chain position
- Include context from previous agent (if applicable)
- Add final task: "Send results to CCOrch API endpoint"

#### Step 5: Generate Chain Identifier
- **Format**: `{chain-name}-{complexity}`
- **Examples**: `backend-development-simple`, `design-only-complex`

---

### 5.3 State Management

CCOrch maintains the following state for each workflow:

- **Workflow ID**: Unique identifier for tracking
- **Chain & Complexity**: Active chain name and complexity level
- **Current Position**: Step number in the agent chain
- **Agent Results**: Outputs from completed agents
- **Pending Tasks**: Queue of upcoming agent tasks

---

### 5.4 API Interface

**Endpoint Overview**:

CCOrch exposes two categories of endpoints:

1. **Hook Endpoints** (called by Claude Code via `.claude/settings.json`):
   - `POST /hooks/user-prompt-submit` - Receives UserPromptSubmit hook, returns agent injection
   - `POST /hooks/post-tool-use` - Receives PostToolUse hook with agent results, returns next agent or completion
   - `POST /hooks/stop` - Receives Stop hook for cleanup, returns 200 OK

2. **Monitoring/Admin API Endpoints** (optional):
   - `GET /api/workflows/{workflow_id}/status` - Query workflow progress (public, read-only)
   - `POST /api/workflows/{workflow_id}/transition` - Manual workflow control (admin only, API key required)

**Flow**:
```
User Prompt → Claude Code → POST /hooks/user-prompt-submit → CCOrch
↓
CCOrch returns agent injection → Claude Code executes agent
↓
Agent completes → Claude Code → POST /hooks/post-tool-use (with agent results in payload) → CCOrch
↓
CCOrch processes results inline → Returns next agent injection OR completion message
```

---

#### 5.4.1 Agent Results (Received via PostToolUse Hook)

**Purpose**: Agent execution results are received via `PostToolUse` hook payload (not separate API)

**Agent Results Schema** (embedded in PostToolUse hook payload):
```typescript
interface AgentResults {
  // Required field
  summary: string;  // 1-3 sentences describing what was done (max 500 chars)

  // Optional by role
  design?: string;           // Architect: architecture decisions/design details
  files_modified?: string[]; // Developer: changed file paths
  issues_found?: Array<{     // Reviewer/Debugger: problems identified
    file: string,
    line?: number,
    severity: "error" | "warning" | "info",
    description: string
  }>;
  recommendations?: string;  // Any role: suggestions for next agent

  // Metadata (optional)
  execution_time_ms?: number;
  token_count?: number;
}
```

**Constraints**:
- `summary`: max 500 characters
- Total JSON size: max 50KB
- No binary attachments (file paths only)

**Processing**: Results extracted from PostToolUse hook payload, processed inline, next agent prompt injected in hook response

---

#### 5.4.2 GET /api/workflows/{workflow_id}/status (Optional Monitoring)

**Purpose**: Query current workflow state and progress

**Request**: No body (query parameter: workflow_id in URL)

**Response**:
```json
{
  "workflow_id": "abc-123",
  "status": "ACTIVE",
  "chain_name": "backend-development",
  "complexity": "moderate",
  "current_step": 1,
  "total_steps": 3,
  "completed_agents": [
    {
      "role": "architect",
      "step": 0,
      "status": "COMPLETED",
      "completed_at": 1734567890000
    }
  ],
  "summary": "Architecture design completed, backend implementation in progress"
}
```

**Status Values**:
- `ACTIVE`: Workflow currently executing
- `COMPLETED`: All agents finished successfully
- `FAILED`: Workflow aborted due to error

---

#### 5.4.3 POST /api/workflows/{workflow_id}/transition (Admin Only)

**Purpose**: Administrative endpoint for manual workflow control (debugging, recovery, testing)

**Access Control**: Admin API key authentication required

**Request**:
```json
{
  "action": "advance",
  "reason": "Manually skipping broken architect step for testing"
}
```

**Action Definitions**:

| Action | Effect | Use Case |
|--------|--------|----------|
| `advance` | Force next step (`current_step++`) | Skip broken agent, force progression |
| `fail` | Abort workflow (status=`FAILED`, stop chain) | Irrecoverable error, cancel workflow |
| `retry` | Re-run current agent (keep `current_step`, clear last result) | Agent gave bad output, want retry |
| `skip` | Jump to next without completing current (`current_step++`, mark `SKIPPED`) | Testing, bypass slow agent |

**Response**:
```json
{
  "workflow_id": "abc-123",
  "previous_step": 0,
  "current_step": 1,
  "next_agent": "backend-developer-moderate",
  "status": "ACTIVE",
  "message": "Transitioned to step 1 (backend-developer-moderate)"
}
```

**Audit Trail**: All transitions logged to `workflow_transitions` table with `reason` field for accountability

## 6. Hook Response Format

### 6.1 UserPromptSubmit Hook Response

CCOrch injects the following prompt to initiate the first agent:

```
Use the {agent-role}-{complexity} subagent to:
1. {task description}
2. {task description}
...
```

---

### 6.2 PostToolUse Hook Response

**Trigger**: Fires when subagent completes its task. CCOrch receives agent results in the hook payload.

#### If chain continues:

CCOrch processes results and injects prompt for the next agent:

```
Use the {next-agent-role}-{complexity} subagent to:
1. Review previous results: {summary}
2. {task description}
...
```

#### If chain complete:

```
Workflow complete. All agents finished successfully.
```

> **Note**: No explicit Stop hook response needed - cleanup handled automatically when CC session ends.

## 7. Example Workflow

### Scenario: Implement REST API for User Authentication

**User Prompt**: `"Implement a REST API for user authentication"`

---

#### CCOrch Processing:

1. **Parse intent**: Backend development task
2. **Determine complexity**: Moderate (API implementation, 2-5 files)
3. **Select chain**: `backend-development-moderate`
4. **Agent sequence**: architect-moderate → backend-developer-moderate → reviewer-moderate

---

#### Step 1: Architect Agent

**CCOrch injects**:
```
Use the architect-moderate subagent to design authentication API architecture
(design only, do not implement)
```

**Agent actions**:
- Designs API architecture (endpoints, JWT strategy, refresh tokens)
- Completes task → Triggers PostToolUse hook with results

---

#### Step 2: Backend Developer Agent

**CCOrch receives** architect results via PostToolUse hook payload

**CCOrch injects**:
```
Use the backend-developer-moderate subagent to implement authentication API
based on design: {architect_results}
```

**Agent actions**:
- Implements endpoints, JWT logic, database models
- Completes task → Triggers PostToolUse hook with results (files modified, implementation summary)

---

#### Step 3: Reviewer Agent

**CCOrch receives** backend-developer results via PostToolUse hook payload

**CCOrch injects**:
```
Use the reviewer-moderate subagent to review authentication API implementation
(review unstaged and staged changes): {developer_results}
```

**Agent actions**:
- Reviews code quality, security, test coverage
- Completes task → Triggers PostToolUse hook with results (issues found, recommendations)

---

#### Step 4: Workflow Complete

- CCOrch updates workflow status to `COMPLETED`
- Returns workflow summary to user:
  ```
  Workflow complete. All agents finished successfully.
  - Architecture designed
  - Authentication API implemented
  - Code reviewed and approved
  ```

## 8. Non-Functional Requirements

### 8.1 Performance
- Hook response time: < 500ms
- Agent transitions: < 1s
- Workflow state persistence

### 8.2 Reliability
- Graceful handling of agent failures
- Workflow recovery mechanisms
- State consistency guarantees

### 8.3 Observability
- Workflow execution logs
- Agent performance metrics
- Chain completion tracking

## 9. Future Considerations

- Custom chain definitions
- Dynamic complexity adjustment
- Parallel agent execution
- Human-in-the-loop checkpoints
- Workflow templates and presets

## 10. References

**Related Documents**:
- **Technical Specification**: `technical-spec.md` - Technology stack, database schema, API specs, development practices
- **Architecture**: `architecture.md` - System architecture diagrams and sequence flows
- **Development Plan**: `development-plan.md` - Implementation phases and timeline
- **Work Breakdown**: `WBS.md` - Granular task breakdown with estimates

**External References**

- Claude Code Hooks: https://github.com/disler/claude-code-hooks-mastery
- Hook Guide: https://docs.claude.com/en/docs/claude-code/hooks-guide.md
- Hook Reference: https://docs.claude.com/en/docs/claude-code/hooks.md
- Subagent Reference: https://docs.claude.com/en/docs/claude-code/sub-agents.md
- Agent definition directory: `.claude/agents/`
