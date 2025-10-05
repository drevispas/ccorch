# CCOrch Architecture & Sequence Diagrams

> **Document Concern**: STRUCTURE (diagrams, visual flows)
>
> This document provides comprehensive architectural diagrams and sequence flows for the Claude Code Orchestrator (CCOrch) system. For product requirements, see `PRD.md`. For technical implementation details, see `technical-spec.md`.

**Related Documents**:
- `PRD.md` - Product requirements (WHAT and WHY)
- `technical-spec.md` - Technical implementation details (HOW)
- `architecture.md` - System architecture and sequence diagrams (STRUCTURE)
- `development-plan.md` - Implementation phases and timeline (WHEN)
- `WBS.md` - Granular work breakdown (TASKS)

## Table of Contents
1. [System Architecture](#1-system-architecture)
2. [Hook Flow Sequences](#2-hook-flow-sequences)
3. [Complete Workflow Example](#3-complete-workflow-example)

---

## 1. System Architecture

### 1.1 Component Overview

```mermaid
---
title: "Diagram 1.1: System Component Overview"
---
graph TB
    subgraph "User Environment"
        USER[User Terminal]
        CC[Claude Code CLI]
    end

    subgraph "CCOrch Server"
        HOOK_HANDLER[Hook Handler]
        PARSER[Prompt Parser]
        RESOLVER[Chain Resolver]
        STATE_MGR[State Manager]
        API[API Layer]

        HOOK_HANDLER -->|2a. Parse| PARSER
        PARSER -->|2b. Resolve chain| RESOLVER
        RESOLVER -->|2c. Create workflow| STATE_MGR
        API -->|5a. Validate & save| STATE_MGR
    end

    subgraph "Data Layer"
        DB[(SQLite DB)]
        WORKFLOWS[workflows table]
        RESULTS[agent_results table]
        TRANSITIONS[workflow_transitions table]

        DB -.->|Schema| WORKFLOWS
        DB -.->|Schema| RESULTS
        DB -.->|Schema| TRANSITIONS
    end

    subgraph "Claude Code Agents"
        ARCH["architect-(complexity)"]
        BACKEND["backend-developer-(complexity)"]
        FRONTEND["frontend-developer-(complexity)"]
        REVIEWER["reviewer-(complexity)"]
        DEBUGGER["debugger-(complexity)"]
    end

    USER -->|1. Submit prompt| CC
    CC -->|2. UserPromptSubmit hook| HOOK_HANDLER
    HOOK_HANDLER -->|3. Inject agent prompt| CC
    CC -->|4. Execute agent| ARCH
    CC -->|4. Execute agent| BACKEND
    CC -->|4. Execute agent| FRONTEND
    CC -->|4. Execute agent| REVIEWER
    CC -->|4. Execute agent| DEBUGGER
    ARCH -.->|5. PostToolUse hook (with results)| HOOK_HANDLER
    BACKEND -.->|5. PostToolUse hook (with results)| HOOK_HANDLER
    FRONTEND -.->|5. PostToolUse hook (with results)| HOOK_HANDLER
    REVIEWER -.->|5. PostToolUse hook (with results)| HOOK_HANDLER
    DEBUGGER -.->|5. PostToolUse hook (with results)| HOOK_HANDLER
    STATE_MGR <-->|7. Read/Write| DB
```

### 1.2 Architecture Layers

#### Hook Integration Layer
- **Purpose**: Intercepts Claude Code lifecycle events
- **Components**: `UserPromptSubmit`, `SubagentStop`, `Stop` handlers
- **Responsibilities**:
  - Parse incoming hook payloads
  - Generate prompt injections for Claude Code
  - Coordinate with orchestration layer

#### Orchestration Core Layer
- **Purpose**: Business logic for workflow management
- **Components**:
  - **Prompt Parser**: Extracts action type, keywords, and context from user prompts
  - **Chain Resolver**: Maps intent to predefined workflow chains, determines complexity level
  - **State Manager**: Maintains workflow lifecycle, manages transitions, ensures consistency
- **Responsibilities**:
  - Intent analysis and chain selection
  - Complexity determination (simple/moderate/complex)
  - Agent sequencing and task generation
  - Workflow state transitions

#### API Layer
- **Purpose**: External interface for agents and clients
- **Endpoints**:
  - `POST /api/workflows/{workflow_id}/results`: Agent result submission
  - `GET /api/workflows/{workflow_id}/status`: Workflow status query
  - `POST /api/workflows/{workflow_id}/transition`: Admin workflow control
- **Responsibilities**:
  - Request validation (zod schemas)
  - Authentication/authorization (future: API keys)
  - Response formatting

#### Data Persistence Layer
- **Purpose**: Workflow state storage and audit logging
- **Technology**: SQLite with Prisma ORM
- **Tables**:
  - **workflows**: Main workflow state (id, chain_name, complexity, current_step, status)
  - **agent_results**: Agent execution outputs (workflow_id, agent_role, results JSON, step_number)
  - **workflow_transitions**: Audit log (from_step, to_step, from_agent, to_agent, reason)
- **Guarantees**: ACID transactions, idempotency via unique constraints

### 1.3 Data Flow

```mermaid
---
title: "Diagram 1.3: Data Flow Overview"
---
flowchart LR
    A[User Prompt] --> B{Parse Intent}
    B --> C{Determine Chain}
    C --> D{Determine Complexity}
    D --> E[Create Workflow Record]
    E --> F[Inject Agent 1 Prompt]
    F --> G[Agent 1 Executes]
    G --> H[PostToolUse Hook with Results]
    H --> I{Process Results Inline}
    I --> J{More Agents?}
    J -->|Yes| K[Inject Next Agent Prompt]
    K --> L[Next Agent Executes]
    L --> H
    J -->|No| M[Mark Workflow COMPLETED]
    M --> N[Return Summary]
```

### 1.4 Workflow Chains

CCOrch supports 9 predefined workflow chains:

| Chain Name | Agent Sequence | Use Case |
|------------|----------------|----------|
| `backend-development` | architect → backend-developer → reviewer | Full backend feature development |
| `frontend-development` | architect → frontend-developer → reviewer | Full frontend feature development |
| `debug` | debugger → backend/frontend-developer → reviewer | Bug investigation and fix |
| `review` | reviewer → backend/frontend-developer | Code review with optional fixes |
| `design-only` | architect | Architecture design without implementation |
| `backend-only` | backend-developer | Backend implementation without design |
| `frontend-only` | frontend-developer | Frontend implementation without design |
| `review-only` | reviewer | Code review without fixes |
| `debug-only` | debugger | Debug investigation without fixes |

**Backend vs Frontend Selection**: For chains with both options (`debug`, `review`), CCOrch uses keyword analysis:
- **Backend keywords**: `java`, `api`, `database`, `controller`, `service`, `repository`, `junit`, `rest`, `endpoint`, `sql`
- **Frontend keywords**: `ui`, `ux`, `component`, `home`, `page`, `typescript`, `web`, `react`, `vue`, `css`, `html`, `button`
- **Default**: backend-developer if ambiguous

### 1.5 Complexity Levels

Each agent in a chain is assigned one of three complexity levels:

| Level | Max Lines | Scope | Use Case |
|-------|-----------|-------|----------|
| **simple** | 8 | Single file/function | Quick fixes, renames, small additions |
| **moderate** | 20 | 2-5 files | Feature implementations, API endpoints |
| **complex** | 50 | Multi-module/system-wide | Architecture design, refactoring, migrations |

**Determination Strategy**:
1. **Keyword analysis**: `quick`, `fix` → simple; `design`, `refactor` → complex
2. **Scope analysis**: Single file → simple; 2-5 files → moderate; System-wide → complex
3. **Default**: moderate if ambiguous

---

### 1.6 CC-Assisted Complexity Determination (Optional Feature)

**Feature Flag**: `ENABLE_CC_COMPLEXITY=true`

When enabled, CCOrch delegates final complexity determination to Claude Code instead of relying solely on keyword-based heuristics:

```mermaid
---
title: "Diagram 1.6: CC-Assisted Complexity Flow"
---
flowchart LR
    A[User Prompt] --> B{Parse Intent}
    B --> C{Determine Chain}
    C --> D{Determine Draft Complexity}
    D --> E[Create Workflow: PENDING_COMPLEXITY]
    E --> F[Ask CC to Analyze]
    F --> G[CC Analyzes Task Scope]
    G --> H[CC Calls set-complexity API]
    H --> I{Validate & Update}
    I --> J[Workflow Status: ACTIVE]
    J --> K[Generate First Agent Prompt]
    K --> L[Return nextInstructions to CC]
    L --> M[CC Executes Agent]
```

**Key Points**:
- Draft complexity serves as initial estimate for CC's analysis
- Workflow remains in `PENDING_COMPLEXITY` state until CC responds
- Stop hook cleanup marks workflows >5min old as FAILED (timeout)
- CC receives agent prompt in `nextInstructions` field of API response

---

## 2. Hook Flow Sequences

### 2.1 UserPromptSubmit Hook Flow

**Trigger**: User submits a prompt to Claude Code

```mermaid
---
title: "Diagram 2.1: UserPromptSubmit Hook Flow"
---
sequenceDiagram
    actor User
    participant CC as Claude Code
    participant Hook as Hook Handler
    participant Parser as Prompt Parser
    participant Resolver as Chain Resolver
    participant StateMgr as State Manager
    participant DB as SQLite DB

    User->>CC: 1. Submit prompt: "Implement REST API for auth"
    activate CC
    CC->>Hook: 2. UserPromptSubmit hook
    activate Hook

    Hook->>Parser: 3. Parse prompt
    activate Parser
    Parser-->>Hook: Intent: "backend implementation"
    deactivate Parser

    Hook->>Resolver: 4. Determine chain & complexity
    activate Resolver
    Note over Resolver: Analyze keywords:<br/>- "implement" + "API" = backend-development<br/>- Scope: 2-5 files = moderate
    Resolver-->>Hook: Chain: "backend-development-moderate"<br/>Sequence: [architect, backend-dev, reviewer]
    deactivate Resolver

    Hook->>StateMgr: 5. Create workflow
    activate StateMgr
    StateMgr->>DB: 5a. INSERT INTO workflows<br/>(id, user_prompt, chain_name, complexity, current_step=0, status='ACTIVE')
    activate DB
    DB-->>StateMgr: workflow_id: "abc-123"
    deactivate DB

    StateMgr->>DB: 5b. INSERT INTO workflow_transitions<br/>(workflow_id, from_step=-1, to_step=0, to_agent='architect')
    activate DB
    DB-->>StateMgr: OK
    deactivate DB
    StateMgr-->>Hook: Workflow created: abc-123
    deactivate StateMgr

    Hook-->>CC: 6. Inject prompt:<br/>"Use architect-moderate to:<br/>- Design auth API architecture (design only, no implementation)<br/>- Send results to POST /api/workflows/abc-123/results"
    deactivate Hook
    CC->>User: 7. Display injected prompt
    deactivate CC
```

**Key Steps**:
1. **Hook emission**: Claude Code emits `UserPromptSubmit` when user submits prompt
2. **Intent parsing**: Extract action type (design, implement, review, debug)
3. **Chain resolution**: Map intent to workflow chain, determine complexity
4. **Workflow creation**: Insert workflow record in DB with status=ACTIVE, current_step=0
5. **Audit logging**: Record transition in workflow_transitions table
6. **Prompt injection**: Return formatted prompt instructing CC to:
   - Use the first agent (architect-moderate) for the assigned task
   - POST results to `/api/workflows/{workflow_id}/results` after task completion
   - This enables the agent to report back and trigger the next step in the chain

**Database State After**:
```sql
-- workflows table
id='abc-123', user_prompt='Implement REST API for auth', chain_name='backend-development',
complexity='moderate', current_step=0, status='ACTIVE'

-- workflow_transitions table
workflow_id='abc-123', from_step=-1, to_step=0, from_agent=NULL, to_agent='architect'
```

---

### 2.1b UserPromptSubmit Hook Flow (with CC Complexity Analysis)

**Trigger**: User submits a prompt to Claude Code (with `ENABLE_CC_COMPLEXITY=true`)

```mermaid
---
title: "Diagram 2.1b: UserPromptSubmit with CC Complexity Determination"
---
sequenceDiagram
    actor User
    participant CC as Claude Code
    participant Hook as Hook Handler
    participant Parser as Prompt Parser
    participant Resolver as Chain Resolver
    participant StateMgr as State Manager
    participant DB as SQLite DB
    participant API as set-complexity API

    User->>CC: 1. Submit prompt: "Implement REST API for auth"
    activate CC
    CC->>Hook: 2. UserPromptSubmit hook
    activate Hook

    Hook->>Parser: 3. Parse prompt
    activate Parser
    Parser-->>Hook: Intent: "backend implementation"
    deactivate Parser

    Hook->>Resolver: 4. Determine chain & draft complexity
    activate Resolver
    Note over Resolver: Analyze keywords:<br/>- "implement" + "API" = backend-development<br/>- Scope heuristic: moderate
    Resolver-->>Hook: Chain: "backend-development"<br/>Draft complexity: "moderate"
    deactivate Resolver

    Hook->>StateMgr: 5. Create workflow
    activate StateMgr
    StateMgr->>DB: 5a. INSERT INTO workflows<br/>(status='PENDING_COMPLEXITY', currentStep=-1,<br/>draftComplexity='moderate')
    activate DB
    DB-->>StateMgr: workflow_id: "abc-123"
    deactivate DB
    StateMgr-->>Hook: Workflow created
    deactivate StateMgr

    Hook-->>CC: 6. Ask CC to analyze complexity:<br/>"Analyze task scope and call<br/>POST /api/workflows/abc-123/set-complexity"
    deactivate Hook

    Note over CC: CC analyzes user prompt,<br/>determines final complexity

    CC->>API: 7. POST /api/workflows/abc-123/set-complexity<br/>{complexity: "moderate", reasoning: "..."}
    activate API

    API->>DB: 8a. UPDATE workflows<br/>SET complexity='moderate', status='ACTIVE', currentStep=0
    activate DB
    DB-->>API: OK
    deactivate DB

    API-->>CC: 8b. {success: true, nextInstructions: "Use backend-architect-moderate..."}
    deactivate API

    CC->>User: 9. Display agent prompt
    deactivate CC
```

**Key Differences from Standard Flow**:
1. Workflow created with `status=PENDING_COMPLEXITY` and `currentStep=-1`
2. Hook response asks CC to analyze complexity (not immediate agent injection)
3. CC makes API call to submit complexity determination
4. API response contains `nextInstructions` for first agent
5. Adds ~500ms latency but improves accuracy

---

### 2.2 PostToolUse Hook Flow (Chain Continues)

**Trigger**: Agent completes and Claude Code fires PostToolUse hook with results

```mermaid
---
title: "Diagram 2.2: PostToolUse Hook Flow (Chain Continues)"
---
sequenceDiagram
    actor Agent as Architect Agent
    participant CC as Claude Code
    participant Hook as Hook Handler
    participant StateMgr as State Manager
    participant DB as SQLite DB

    Note over Agent: Agent completes task

    Agent->>CC: 1. Task complete (agent finishes)
    activate CC
    CC->>Hook: 2. PostToolUse hook (payload includes agent results:<br/>{agent_role: 'architect', complexity: 'moderate',<br/>results: {summary: '...', design: '...'}, status: 'COMPLETED'})
    activate Hook

    Hook->>StateMgr: 3. Extract & validate results from hook payload
    activate StateMgr

    activate StateMgr
    StateMgr->>DB: 3a. SELECT * FROM workflows WHERE id='abc-123'
    activate DB
    DB-->>StateMgr: {current_step: 0, chain_name: 'backend-development', status: 'ACTIVE'}
    deactivate DB

    Note over StateMgr: Validate:<br/>- Workflow exists & ACTIVE<br/>- Agent matches expected (architect at step 0)<br/>- No duplicate results for step 0

    StateMgr->>DB: 3b. INSERT INTO agent_results<br/>(workflow_id, agent_role, complexity, step_number=0,<br/>results='...', status='COMPLETED')
    activate DB
    DB-->>StateMgr: OK (unique constraint on workflow_id + step_number)
    deactivate DB

    StateMgr->>DB: 3c. UPDATE workflows SET current_step=1, updated_at=NOW()<br/>WHERE id='abc-123'
    activate DB
    DB-->>StateMgr: OK
    deactivate DB

    StateMgr->>DB: 3d. INSERT INTO workflow_transitions<br/>(workflow_id, from_step=0, to_step=1,<br/>from_agent='architect', to_agent='backend-developer')
    activate DB
    DB-->>StateMgr: OK
    deactivate DB

    StateMgr-->>Hook: 4. Results saved, next agent: backend-developer-moderate
    deactivate StateMgr

    Hook-->>CC: 5. Inject prompt in hook response:<br/>"Use backend-developer-moderate to:<br/>- Review architect results: {...}<br/>- Implement auth API endpoints, JWT logic, DB models"
    deactivate Hook
    CC->>Agent: 6. Display injected prompt
    deactivate CC
```

**Key Steps**:
1. **Agent completion**: Agent finishes task, Claude Code fires PostToolUse hook
2. **Hook payload**: Results included in PostToolUse hook payload (agent_role, complexity, results, status)
3. **Inline processing**: CCOrch extracts results from payload, no separate API call
4. **Validation**: Verify workflow exists, is ACTIVE, agent matches expected role
5. **Idempotency check**: Unique constraint on `(workflow_id, step_number)` prevents duplicates
6. **Result persistence**: Insert agent_results record with step_number
7. **Workflow advancement**: Increment current_step, update timestamp
8. **Audit logging**: Record transition with from_agent and to_agent
9. **Next agent injection**: Generate prompt for next agent in hook response:
   - Use the next agent in the chain (backend-developer-moderate)
   - Review previous agent's results (architect's design)
   - Execute the next task (implement auth API endpoints)
   - Synchronous orchestration - next prompt injected directly in PostToolUse hook response

**Database State After**:
```sql
-- workflows table
current_step=1 (incremented), updated_at=<new_timestamp>

-- agent_results table
workflow_id='abc-123', agent_role='architect', step_number=0, results='...'

-- workflow_transitions table (new row)
workflow_id='abc-123', from_step=0, to_step=1, from_agent='architect', to_agent='backend-developer'
```

---

### 2.3 PostToolUse Hook Flow (Chain Complete)

**Trigger**: Final agent in chain completes, fires PostToolUse hook

```mermaid
---
title: "Diagram 2.3: PostToolUse Hook Flow (Chain Complete)"
---
sequenceDiagram
    actor Agent as Reviewer Agent
    participant CC as Claude Code
    participant Hook as Hook Handler
    participant StateMgr as State Manager
    participant DB as SQLite DB

    Note over Agent: Final agent in chain (step 2 of 3-agent chain)

    Agent->>CC: 1. Task complete
    activate CC
    CC->>Hook: 2. PostToolUse hook (payload with reviewer results:<br/>{agent_role: 'reviewer', complexity: 'moderate',<br/>results: {summary: '...', issues_found: []}, status: 'COMPLETED'})
    activate Hook

    Hook->>StateMgr: 3. Extract & validate results
    activate StateMgr

    activate StateMgr
    StateMgr->>DB: 3a. SELECT * FROM workflows WHERE id='abc-123'
    activate DB
    DB-->>StateMgr: {current_step: 2, chain_name: 'backend-development', status: 'ACTIVE'}
    deactivate DB

    Note over StateMgr: Validate:<br/>- Workflow ACTIVE<br/>- Agent is 'reviewer' at step 2<br/>- This is the final step in chain

    StateMgr->>DB: 3b. INSERT INTO agent_results<br/>(workflow_id, agent_role, step_number=2, results='...')
    activate DB
    DB-->>StateMgr: OK
    deactivate DB

    Note over StateMgr: Detect chain completion:<br/>current_step (2) = last step in backend-development chain

    StateMgr->>DB: 3c. UPDATE workflows<br/>SET status='COMPLETED', current_step=3, updated_at=NOW()<br/>WHERE id='abc-123'
    activate DB
    DB-->>StateMgr: OK
    deactivate DB

    StateMgr->>DB: 3d. INSERT INTO workflow_transitions<br/>(workflow_id, from_step=2, to_step=3,<br/>from_agent='reviewer', to_agent=NULL, reason='Workflow completed')
    activate DB
    DB-->>StateMgr: OK
    deactivate DB

    StateMgr->>DB: 3e. SELECT * FROM agent_results WHERE workflow_id='abc-123' ORDER BY step_number
    activate DB
    DB-->>StateMgr: [{architect results}, {backend-dev results}, {reviewer results}]
    deactivate DB

    StateMgr-->>Hook: 4. Workflow COMPLETED, all agents finished
    deactivate StateMgr

    Hook-->>CC: 5. Return completion summary in hook response:<br/>"Workflow complete. All agents finished successfully.<br/>- Architecture designed<br/>- Authentication API implemented<br/>- Code reviewed and approved"
    deactivate Hook
    CC->>Agent: 6. Display completion summary
    deactivate CC
```

**Key Steps**:
1. **Final agent completion**: Last agent finishes, Claude Code fires PostToolUse hook with results
2. **Result extraction**: CCOrch extracts results from PostToolUse hook payload
3. **Result persistence**: Insert agent_results record
4. **Chain completion detection**: Check if current_step equals chain length
5. **Workflow finalization**: Update status to COMPLETED, increment current_step
6. **Audit logging**: Record final transition with to_agent=NULL
7. **Summary generation**: Aggregate results from all agents
8. **Completion message**: Display workflow summary to user in hook response:
   - Workflow completion status
   - Summary of each agent's contributions (architecture, implementation, review)
   - No further agent prompt injection (chain complete)
   - Synchronous orchestration complete

**Database State After**:
```sql
-- workflows table
status='COMPLETED', current_step=3 (beyond last agent), updated_at=<timestamp>

-- agent_results table (all steps completed)
step_number=0: architect results
step_number=1: backend-developer results
step_number=2: reviewer results

-- workflow_transitions table (final transition)
from_step=2, to_step=3, from_agent='reviewer', to_agent=NULL, reason='Workflow completed'
```

---

### 2.4 Stop Hook Flow (Cleanup)

**Trigger**: Fires after **each agent completion** (alongside PostToolUse hook)

**Important**: The `Stop` hook does NOT signal session termination or chain completion. It fires after every agent execution as part of the prompt lifecycle. Use `PostToolUse` for chain continuation logic.

```mermaid
---
title: "Diagram 2.4: Stop Hook Flow (Cleanup)"
---
sequenceDiagram
    participant CC as Claude Code
    participant Hook as Hook Handler
    participant StateMgr as State Manager
    participant DB as SQLite DB

    Note over CC: Stop hook fires after each agent completion<br/>(alongside PostToolUse)

    CC->>Hook: 1. Stop hook
    activate Hook

    Hook->>StateMgr: 2. Check for orphaned workflows
    activate StateMgr

    StateMgr->>DB: 2a. SELECT * FROM workflows<br/>WHERE status='ACTIVE'<br/>AND updated_at < NOW() - threshold
    activate DB
    Note over DB: Find workflows that are ACTIVE<br/>but haven't been updated recently<br/>(e.g., >5 minutes stale)<br/>These are truly orphaned (crashed/abandoned)
    DB-->>StateMgr: [{workflow_id: 'xyz-789', current_step: 1, ...}] OR []
    deactivate DB

    alt Orphaned workflows found
        Note over StateMgr: Identify truly orphaned workflows:<br/>- Status is ACTIVE<br/>- No recent updates (>5min stale)<br/>- Likely crashed or abandoned

        StateMgr->>DB: 2b. UPDATE workflows<br/>SET status='FAILED', updated_at=NOW()<br/>WHERE id IN ('xyz-789', ...)
        activate DB
        DB-->>StateMgr: OK
        deactivate DB

        StateMgr->>DB: 2c. INSERT INTO workflow_transitions<br/>(workflow_id='xyz-789', from_step=1, to_step=1,<br/>reason='Orphaned workflow detected')
        activate DB
        DB-->>StateMgr: OK
        deactivate DB

        StateMgr-->>Hook: Cleaned up N orphaned workflows
    else No orphaned workflows
        StateMgr-->>Hook: No cleanup needed
    end
    deactivate StateMgr

    Note over Hook: No message injection<br/>(Stop hook never returns messages)

    Hook-->>CC: 3. Cleanup complete (200 OK)
    deactivate Hook
```

**Key Steps**:
1. **Hook emission**: Claude Code emits `Stop` hook after **every agent completion** (not just session end)
2. **Orphan detection**: Query for ACTIVE workflows with stale timestamps (>5 min old)
3. **Status update**: Mark truly orphaned workflows as FAILED (if any found)
4. **Audit logging**: Record cleanup reason in workflow_transitions
5. **No injection**: Stop hook never performs message injection (always returns 200 OK)

**Database State After** (if orphaned workflows found):
```sql
-- workflows table (orphaned workflows marked FAILED)
status='FAILED', updated_at=<timestamp>

-- workflow_transitions table (cleanup audit)
reason='Orphaned workflow detected'
```

**Orphan Detection Strategy**:
- Workflows with status='ACTIVE'
- Last updated_at > 5 minutes ago (configurable threshold)
- No recent agent_results submissions
- **Note**: Most Stop hook invocations will find **zero** orphaned workflows (normal operation)

---

## 3. Complete Workflow Example

### 3.1 End-to-End Sequence: "Implement REST API for User Authentication"

This example demonstrates a complete `backend-development-moderate` workflow with all three agents.

```mermaid
---
title: "Diagram 3.1: Complete Workflow Example - Backend Development"
---
sequenceDiagram
    actor User
    participant CC as Claude Code
    participant Hook as Hook Handler
    participant Orch as Orchestrator Core
    participant API as API Layer
    participant DB as SQLite DB
    participant Arch as architect-moderate
    participant Backend as backend-developer-moderate
    participant Rev as reviewer-moderate

    %% Step 0: User submission
    User->>CC: 1. "Implement REST API for user authentication"
    CC->>Hook: 2. UserPromptSubmit hook
    Hook->>Orch: 3. Parse & resolve chain
    Note over Orch: Intent: backend implementation<br/>Scope: 2-5 files (moderate)<br/>Chain: backend-development
    Orch->>DB: 4. CREATE workflow (id='wf-001', chain='backend-development',<br/>complexity='moderate', current_step=0)
    DB-->>Orch: OK
    Orch-->>Hook: Chain: [architect → backend-dev → reviewer]
    Hook-->>CC: 5. "Use architect-moderate to design auth API (design only, no impl)"
    CC->>User: Display prompt

    %% Step 1: Architect agent
    Note over User,CC: [STEP 1] User approves, CC launches architect-moderate agent
    CC->>Arch: 6. Execute with injected prompt
    activate Arch
    Note over Arch: Design architecture:<br/>- RESTful endpoints (POST /login, /refresh, /logout)<br/>- JWT token strategy<br/>- Refresh token mechanism<br/>- Database schema for users/tokens
    Arch->>API: 7. POST /api/workflows/wf-001/results<br/>{agent_role: 'architect', results: {<br/>  summary: 'Designed JWT-based auth API',<br/>  design: 'Endpoints: POST /auth/login...',<br/>  recommendations: 'Use bcrypt for passwords'<br/>}}
    deactivate Arch

    API->>DB: 8a. INSERT agent_results (step=0, agent='architect')
    DB-->>API: OK
    API->>DB: 8b. UPDATE workflows SET current_step=1
    DB-->>API: OK
    API->>DB: 8c. INSERT transition (from_step=0, to_step=1)
    DB-->>API: OK
    API-->>Arch: 9. {success: true}

    Arch->>CC: 10. SubagentStop
    CC->>Hook: 11. SubagentStop hook
    Hook->>DB: 12a. Get workflow state (current_step=1)
    DB-->>Hook: Next agent: backend-developer
    Hook->>DB: 12b. Get architect results
    DB-->>Hook: {design: '...', recommendations: '...'}
    Hook-->>CC: 13. "Use backend-developer-moderate to:<br/>- Review architect design: {...}<br/>- Implement auth API endpoints, JWT logic, DB models<br/>- Send results to POST /api/workflows/wf-001/results"
    CC->>User: Display prompt

    %% Step 2: Backend Developer agent
    Note over User,CC: [STEP 2] User approves, CC launches backend-developer-moderate
    CC->>Backend: 14. Execute with context from architect
    activate Backend
    Note over Backend: Implement:<br/>- Create AuthController.java (login, refresh, logout endpoints)<br/>- JWT token generation/validation service<br/>- User & RefreshToken JPA entities<br/>- Password hashing with bcrypt<br/>- Unit tests
    Backend->>API: 15. POST /api/workflows/wf-001/results<br/>{agent_role: 'backend-developer', results: {<br/>  summary: 'Implemented JWT auth API with 5 files',<br/>  files_modified: ['AuthController.java', 'JwtService.java', ...],<br/>  recommendations: 'Review security headers and error handling'<br/>}}
    deactivate Backend

    API->>DB: 16a. INSERT agent_results (step=1, agent='backend-developer')
    DB-->>API: OK
    API->>DB: 16b. UPDATE workflows SET current_step=2
    DB-->>API: OK
    API->>DB: 16c. INSERT transition (from_step=1, to_step=2)
    DB-->>API: OK
    API-->>Backend: 17. {success: true}

    Backend->>CC: 18. SubagentStop
    CC->>Hook: 19. SubagentStop hook
    Hook->>DB: 20a. Get workflow state (current_step=2)
    DB-->>Hook: Next agent: reviewer
    Hook->>DB: 20b. Get backend-developer results
    DB-->>Hook: {files_modified: [...], recommendations: '...'}
    Hook-->>CC: 21. "Use reviewer-moderate to:<br/>- Review staged/unstaged changes<br/>- Check security, tests, error handling<br/>- Send results to POST /api/workflows/wf-001/results"
    CC->>User: Display prompt

    %% Step 3: Reviewer agent
    Note over User,CC: [STEP 3] User approves, CC launches reviewer-moderate
    CC->>Rev: 22. Execute with context from backend-developer
    activate Rev
    Note over Rev: Review code:<br/>- Security: JWT secret storage, password hashing ✓<br/>- Tests: Unit tests present ✓<br/>- Error handling: Add 401 for invalid tokens<br/>- Recommendations: Add rate limiting
    Rev->>API: 23. POST /api/workflows/wf-001/results<br/>{agent_role: 'reviewer', results: {<br/>  summary: 'Code review complete, minor improvements suggested',<br/>  issues_found: [{<br/>    file: 'AuthController.java', line: 42,<br/>    severity: 'warning', description: 'Consider 401 for invalid tokens'<br/>  }],<br/>  recommendations: 'Add rate limiting middleware'<br/>}}
    deactivate Rev

    API->>DB: 24a. INSERT agent_results (step=2, agent='reviewer')
    DB-->>API: OK
    Note over API: Detect chain completion (step 2 = last step)
    API->>DB: 24b. UPDATE workflows SET status='COMPLETED', current_step=3
    DB-->>API: OK
    API->>DB: 24c. INSERT transition (from_step=2, to_step=3, to_agent=NULL, reason='completed')
    DB-->>API: OK
    API-->>Rev: 25. {success: true, status: 'COMPLETED'}

    Rev->>CC: 26. SubagentStop
    CC->>Hook: 27. SubagentStop hook
    Hook->>DB: 28a. Get workflow state (status='COMPLETED')
    DB-->>Hook: Workflow finished
    Hook->>DB: 28b. SELECT all agent_results for wf-001
    DB-->>Hook: [architect, backend-dev, reviewer results]
    Hook-->>CC: 29. "Workflow complete. All agents finished successfully.<br/><br/>✓ Architecture designed (JWT auth with refresh tokens)<br/>✓ Authentication API implemented (5 files)<br/>✓ Code reviewed (1 warning, consider rate limiting)"
    CC->>User: 30. Display completion summary
```

### 3.2 Database State Progression

**After UserPromptSubmit (Step 0)**:
```sql
-- workflows
id='wf-001', user_prompt='Implement REST API for user authentication',
chain_name='backend-development', complexity='moderate', current_step=0, status='ACTIVE'

-- workflow_transitions
from_step=-1, to_step=0, from_agent=NULL, to_agent='architect'
```

**After Architect Completion (Step 1)**:
```sql
-- workflows
current_step=1, updated_at=<timestamp>

-- agent_results
step_number=0, agent_role='architect', results='{"summary":"Designed JWT-based auth API",...}'

-- workflow_transitions (new row)
from_step=0, to_step=1, from_agent='architect', to_agent='backend-developer'
```

**After Backend Developer Completion (Step 2)**:
```sql
-- workflows
current_step=2

-- agent_results (new row)
step_number=1, agent_role='backend-developer', results='{"summary":"Implemented JWT auth API",...}'

-- workflow_transitions (new row)
from_step=1, to_step=2, from_agent='backend-developer', to_agent='reviewer'
```

**After Reviewer Completion (Step 3 - COMPLETED)**:
```sql
-- workflows
current_step=3, status='COMPLETED'

-- agent_results (new row)
step_number=2, agent_role='reviewer', results='{"summary":"Code review complete",...}'

-- workflow_transitions (new row)
from_step=2, to_step=3, from_agent='reviewer', to_agent=NULL, reason='Workflow completed'
```

### 3.3 Timing Considerations

| Phase | Component | Time Budget | Notes |
|-------|-----------|-------------|-------|
| Hook processing | Hook Handler → Orchestrator | <500ms | PRD requirement (section 8.1) |
| Chain determination | Prompt Parser + Chain Resolver | <200ms | Keyword analysis, chain mapping |
| DB write | State Manager → SQLite | <100ms | Single transaction with 3 writes |
| Agent execution | Claude Code agent | Variable | Depends on task complexity |
| API submission | Agent → CCOrch API | <200ms | Result validation + persistence |
| Transition logic | State Manager | <1s | PRD requirement (section 8.1) |

**Total overhead per agent transition**: ~800ms (excludes agent execution time)

---

## 4. Error Handling & Edge Cases

### 4.1 Hook Retry Scenario

```mermaid
---
title: "Diagram 4.1: Hook Retry Scenario (Idempotency)"
---
sequenceDiagram
    participant Agent
    participant API as API Layer
    participant DB as SQLite DB

    Agent->>API: POST /results (attempt 1)
    activate API
    API->>DB: INSERT agent_results (workflow_id, step_number)
    activate DB
    DB-->>API: OK
    deactivate DB
    API-->>Agent: {success: true}
    deactivate API

    Note over Agent,API: Network glitch: agent didn't receive response

    Agent->>API: POST /results (retry attempt 2, same data)
    activate API
    API->>DB: INSERT agent_results (workflow_id, step_number)
    activate DB
    Note over DB: UNIQUE constraint violation on<br/>(workflow_id, step_number)
    DB-->>API: ERROR: duplicate key
    deactivate DB
    Note over API: Idempotency: treat as success<br/>(result already persisted)
    API-->>Agent: {success: true, message: 'Result already recorded'}
    deactivate API
```

**Idempotency Guarantee**: Unique constraint on `(workflow_id, step_number)` prevents duplicate agent results.

### 4.2 Agent Failure Scenario

```mermaid
---
title: "Diagram 4.2: Agent Failure Scenario (Recovery)"
---
sequenceDiagram
    participant Agent
    participant API
    participant DB
    participant Admin

    Agent->>API: POST /results {status: 'FAILED', results: {error: 'Timeout'}}
    activate API
    API->>DB: INSERT agent_results (status='FAILED')
    DB-->>API: OK
    API->>DB: UPDATE workflows SET status='FAILED'
    DB-->>API: OK
    API-->>Agent: {success: true}
    deactivate API

    Note over Admin: Admin investigates via GET /status
    Admin->>API: GET /workflows/{id}/status
    API->>DB: SELECT workflow state
    DB-->>API: {status: 'FAILED', last_agent: 'backend-developer'}
    API-->>Admin: Workflow failed at backend-developer step

    Note over Admin: Admin decides to retry
    Admin->>API: POST /workflows/{id}/transition {action: 'retry'}
    API->>DB: DELETE FROM agent_results WHERE step_number=current_step
    DB-->>API: OK
    API-->>Admin: Ready to retry backend-developer step
```

---

## 5. References

- **PRD**: `docs/PRD.md` - Complete product requirements
- **Development Plan**: `docs/development-plan.md` - Implementation phases
- **Claude Code Hooks Guide**: https://docs.claude.com/en/docs/claude-code/hooks-guide.md
- **Hook Reference**: https://docs.claude.com/en/docs/claude-code/hooks.md
- **Subagent Reference**: https://docs.claude.com/en/docs/claude-code/sub-agents.md
