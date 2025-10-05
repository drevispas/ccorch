# Technical Specification: Claude Code Orchestrator

> **Document Concern**: HOW (developers, architects)
>
> This document specifies the technical implementation details for the Claude Code Orchestrator (CCOrch), including technology stack, database schema, API specifications, and development practices.

**Related Documents**:
- `PRD.md` - Product requirements (WHAT and WHY)
- `technical-spec.md` - Technical implementation details (HOW)
- `architecture.md` - System architecture and sequence diagrams (STRUCTURE)
- `development-plan.md` - Implementation phases and timeline (WHEN)
- `WBS.md` - Granular work breakdown (TASKS)

---

## Table of Contents

1. [Technology Stack](#1-technology-stack)
2. [Database Schema](#2-database-schema)
3. [API Specifications](#3-api-specifications)
4. [Development Practices](#4-development-practices)
5. [Project Structure](#5-project-structure)
6. [Error Handling](#6-error-handling)
7. [Performance Requirements](#7-performance-requirements)

---

## 1. Technology Stack

### 1.1 Backend Framework

- **Runtime**: Node.js (LTS v18+)
- **Language**: TypeScript 5.3+
- **Web Framework**: **Express.js** (preferred) or Fastify
- **Rationale**: Fast development, excellent JSON/text processing for prompt parsing, strong ecosystem

### 1.2 State Management

#### Primary Storage: SQLite
- **Use Case**: Development and single-instance deployment
- **Features**:
  - ACID transactions for state consistency
  - File-based, zero setup
  - Sufficient for <10k workflows/day
- **Library**: **Prisma ORM** with SQLite provider (chosen for this project - type-safe, migrations, large community)
  - Alternative: better-sqlite3 (synchronous API, fastest) or bun:sqlite

#### Future Migration Path: Redis
- **Use Case**: Production/distributed deployment
- **Benefits**:
  - In-memory performance (<500ms requirement)
  - Horizontal scaling support
  - Pub/sub for distributed hooks

### 1.3 Database Tools

#### ORM/Query Builder (choose one)
- **Prisma** (recommended) - Type-safe ORM with migrations, largest community
- Drizzle - Lightweight, SQL-like TypeScript ORM, growing rapidly
- Kysely - Type-safe SQL query builder

#### Validation & Monitoring
- **Schema Validation**: zod - Runtime type validation for state objects
- **Monitoring**: DataGrip, DB Browser for SQLite, or VS Code SQLite extension

### 1.4 HTTP & API

- **HTTP Client**: **native fetch** (Node 18+) or axios
- **Request Validation**: zod + express-validator
- **API Documentation**: OpenAPI/Swagger (optional, recommended for production)

### 1.5 Workflow Engine

- **State Machine**: **Custom implementation** (simple, no external dependencies)
- **Alternative**: xstate (optional, if complex state transitions emerge)
- **Task Queue** (future): BullMQ with Redis backend

### 1.6 Logging & Observability

- **Logging**: **pino** (fastest JSON logger) or winston
- **Request Tracing**: express-request-id (correlation IDs)
- **Metrics** (future): Prometheus + Grafana

### 1.7 Development Tools

- **Package Manager**: **pnpm** (preferred), npm, or yarn
- **Testing**: **vitest** (fast, ESM-native) or jest + supertest
- **Linting**: eslint + @typescript-eslint
- **Formatting**: prettier
- **Process Manager**: pm2 (production)

### 1.8 Core Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.0",
    "@prisma/client": "^5.7.0",
    "zod": "^3.22.0",
    "pino": "^8.16.0",
    "express-request-id": "^3.0.0",
    "dotenv": "^16.3.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/express": "^4.17.0",
    "vitest": "^1.0.0",
    "supertest": "^6.3.0",
    "eslint": "^8.54.0",
    "@typescript-eslint/eslint-plugin": "^6.13.0",
    "@typescript-eslint/parser": "^6.13.0",
    "prettier": "^3.1.0",
    "tsx": "^4.7.0",
    "prisma": "^5.7.0"
  }
}
```

---

## 2. Database Schema

### 2.1 Schema Overview

Three core tables: `workflows`, `agent_results`, `workflow_transitions`

**Design Principles**:
- Idempotency via unique constraints
- Audit trail for all state changes
- JSON blobs for flexible agent results
- Cascading deletes for referential integrity

### 2.2 SQL Schema (SQLite)

```sql
-- Workflows table
-- Stores the main workflow state and metadata for orchestrating multi-agent chains
CREATE TABLE workflows (
  -- Unique workflow identifier (UUID recommended, e.g., 'wf-a1b2c3d4')
  id TEXT PRIMARY KEY,

  -- Original user prompt that initiated the workflow
  user_prompt TEXT NOT NULL,

  -- Name of the agent chain (e.g., 'backend-development', 'debug', 'design-only')
  -- Valid values: backend-development, frontend-development, debug, review,
  --               design-only, backend-only, frontend-only, review-only, debug-only
  chain_name TEXT NOT NULL,

  -- Complexity level for all agents in this workflow
  -- Valid values: simple, moderate, complex
  complexity TEXT NOT NULL,

  -- Current position in the agent chain (0-indexed)
  -- Indicates the next agent to execute
  -- Example: 0 = backend-architect (first agent), 1 = backend-developer (second agent)
  current_step INTEGER DEFAULT 0,

  -- Workflow execution status
  -- Valid values: ACTIVE, COMPLETED, FAILED
  status TEXT DEFAULT 'ACTIVE',

  -- Unix timestamp (milliseconds) when workflow was created
  created_at INTEGER NOT NULL,

  -- Unix timestamp (milliseconds) when workflow was last updated
  updated_at INTEGER NOT NULL,

  -- Constraints
  CHECK (status IN ('ACTIVE', 'COMPLETED', 'FAILED')),
  CHECK (complexity IN ('simple', 'moderate', 'complex')),
  CHECK (current_step >= 0)
);

-- Agent results table
-- Stores the output and metadata from each agent execution within a workflow
CREATE TABLE agent_results (
  -- Auto-incrementing primary key
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Reference to the parent workflow
  workflow_id TEXT NOT NULL,

  -- Role of the agent that produced this result
  -- Valid values: backend-architect, frontend-architect, backend-developer, frontend-developer, reviewer, debugger, e2e-test-architect
  agent_role TEXT NOT NULL,

  -- Complexity level of the agent
  -- Valid values: simple, moderate, complex
  complexity TEXT NOT NULL,

  -- Position of this agent in the workflow chain (0-indexed)
  -- Must match the workflow's current_step at time of submission
  step_number INTEGER NOT NULL,

  -- JSON blob containing the agent's output/results
  -- Structure: {"summary": "...", "design": "...", "files_modified": [...], ...}
  -- See AgentResults interface in section 3.2
  results TEXT NOT NULL,

  -- Agent execution status
  -- Valid values: COMPLETED, FAILED, PARTIAL, SKIPPED
  status TEXT DEFAULT 'COMPLETED',

  -- Unix timestamp (milliseconds) when agent completed
  created_at INTEGER NOT NULL,

  -- Foreign key constraint with cascading delete
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,

  -- Idempotency constraint: prevent duplicate agent results for the same workflow step
  UNIQUE (workflow_id, step_number),

  -- Constraints
  CHECK (status IN ('COMPLETED', 'FAILED', 'PARTIAL', 'SKIPPED')),
  CHECK (complexity IN ('simple', 'moderate', 'complex')),
  CHECK (step_number >= 0)
);

-- Workflow transitions table (audit log)
-- Tracks state transitions between agents for debugging and observability
CREATE TABLE workflow_transitions (
  -- Auto-incrementing primary key
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Reference to the parent workflow
  workflow_id TEXT NOT NULL,

  -- Previous step number in the chain
  -- -1 indicates workflow creation (no previous agent)
  from_step INTEGER NOT NULL,

  -- Next step number in the chain
  -- Used for tracking progression through agent sequence
  to_step INTEGER NOT NULL,

  -- Agent role that completed (nullable for initial transition)
  -- Valid values: backend-architect, frontend-architect, backend-developer, frontend-developer, reviewer, debugger, e2e-test-architect, NULL
  from_agent TEXT,

  -- Agent role that will execute next (nullable for final transition)
  -- NULL indicates workflow completion (no next agent)
  to_agent TEXT,

  -- Reason for this transition
  -- Default: "Agent completed successfully" (automatic transitions)
  -- Custom: Admin-provided reason for manual transitions (advance, fail, retry, skip)
  reason TEXT NOT NULL DEFAULT 'Agent completed successfully',

  -- Unix timestamp (milliseconds) when transition occurred
  created_at INTEGER NOT NULL,

  -- Foreign key constraint with cascading delete
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,

  -- Constraints
  CHECK (from_step >= -1),
  CHECK (to_step >= 0)
);

-- Indexes for query performance
-- Speed up workflow status queries (e.g., finding all active workflows)
CREATE INDEX idx_workflows_status ON workflows(status);

-- Speed up workflow history queries (e.g., recent workflows)
CREATE INDEX idx_workflows_created ON workflows(created_at);

-- Speed up agent result lookups by workflow
CREATE INDEX idx_agent_results_workflow ON agent_results(workflow_id);

-- Speed up transition history lookups
CREATE INDEX idx_transitions_workflow ON workflow_transitions(workflow_id);
```

### 2.3 Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Workflow {
  id               String   @id
  userPrompt       String   @map("user_prompt")
  chainName        String   @map("chain_name")
  complexity       String
  currentStep      Int      @default(0) @map("current_step")
  status           String   @default("ACTIVE")
  createdAt        BigInt   @map("created_at")
  updatedAt        BigInt   @map("updated_at")

  agentResults     AgentResult[]
  transitions      WorkflowTransition[]

  @@index([status], name: "idx_workflows_status")
  @@index([createdAt], name: "idx_workflows_created")
  @@map("workflows")
}

model AgentResult {
  id           Int      @id @default(autoincrement())
  workflowId   String   @map("workflow_id")
  agentRole    String   @map("agent_role")
  complexity   String
  stepNumber   Int      @map("step_number")
  results      String   // JSON blob
  status       String   @default("COMPLETED")
  createdAt    BigInt   @map("created_at")

  workflow     Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)

  @@unique([workflowId, stepNumber])
  @@index([workflowId], name: "idx_agent_results_workflow")
  @@map("agent_results")
}

model WorkflowTransition {
  id           Int      @id @default(autoincrement())
  workflowId   String   @map("workflow_id")
  fromStep     Int      @map("from_step")
  toStep       Int      @map("to_step")
  fromAgent    String?  @map("from_agent")
  toAgent      String?  @map("to_agent")
  reason       String   @default("Agent completed successfully")
  createdAt    BigInt   @map("created_at")

  workflow     Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)

  @@index([workflowId], name: "idx_transitions_workflow")
  @@map("workflow_transitions")
}
```

### 2.4 Data Types & Enums

```typescript
// Workflow status
enum WorkflowStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

// Agent execution status
enum AgentStatus {
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  PARTIAL = 'PARTIAL',
  SKIPPED = 'SKIPPED',
}

// Complexity levels
enum Complexity {
  SIMPLE = 'simple',
  MODERATE = 'moderate',
  COMPLEX = 'complex',
}

// Agent roles
enum AgentRole {
  BACKEND_ARCHITECT = 'backend-architect',
  FRONTEND_ARCHITECT = 'frontend-architect',
  BACKEND_DEVELOPER = 'backend-developer',
  FRONTEND_DEVELOPER = 'frontend-developer',
  REVIEWER = 'reviewer',
  DEBUGGER = 'debugger',
  E2E_TEST_ARCHITECT = 'e2e-test-architect',
}

// Workflow chains
enum ChainName {
  BACKEND_DEVELOPMENT = 'backend-development',
  FRONTEND_DEVELOPMENT = 'frontend-development',
  DEBUG = 'debug',
  REVIEW = 'review',
  BACKEND_DESIGN_ONLY = 'backend-design-only',
  FRONTEND_DESIGN_ONLY = 'frontend-design-only',
  BACKEND_ONLY = 'backend-only',
  FRONTEND_ONLY = 'frontend-only',
  REVIEW_ONLY = 'review-only',
  DEBUG_ONLY = 'debug-only',
}
```

---

## 3. API Specifications

### 3.1 API Overview

**Base URLs**:
- Hook endpoints: `http://localhost:3000/hooks` (called by Claude Code)
- Agent API endpoints: `http://localhost:3000/api` (called by agents)

**Authentication**:
- Hook endpoints: Shared secret via `X-Hook-Secret` header (prevents unauthorized workflow creation)
- Agent API endpoints: Public (POST /results, GET /status) | API key for admin endpoints (POST /transition)

**Content-Type**: `application/json`

**Endpoint Categories**:

1. **Hook Endpoints** (called by Claude Code via `.claude/settings.json`):
   ```
   POST /hooks/user-prompt-submit   - UserPromptSubmit hook handler
   POST /hooks/post-tool-use        - PostToolUse hook handler (receives agent results)
   POST /hooks/stop                  - Stop hook handler (cleanup)
   ```

2. **Monitoring/Admin API Endpoints** (optional):
   ```
   GET  /api/workflows/{id}/status     - Query workflow status (read-only monitoring)
   POST /api/workflows/{id}/transition - Manual workflow control (admin, API key)
   ```

**Request Flow**:
```
Claude Code → /hooks/user-prompt-submit → Agent injection
Agent executes → Completes
Claude Code → /hooks/post-tool-use (with results) → Next agent or completion
```

**Error Format**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid workflow ID format",
    "details": [...]
  }
}
```

---

### 3.2 Hook Endpoints

#### 3.2.1 POST /hooks/user-prompt-submit

**Purpose**: Receives UserPromptSubmit hook from Claude Code, analyzes user intent, returns agent injection

**Authentication**: `X-Hook-Secret` header (shared secret)

**Request**: Hook payload from Claude Code (structure defined by Claude Code hooks spec)

**Response**:
```json
{
  "message": "Use the backend-architect-moderate subagent to:\n1. Design authentication system..."
}
```

#### 3.2.2 POST /hooks/post-tool-use

**Purpose**: Receives PostToolUse hook from Claude Code when agent completes, processes results, determines next agent or completes workflow

**Trigger**: Fires when subagent finishes its task

**Authentication**: `X-Hook-Secret` header (shared secret)

**Request**: Hook payload from Claude Code with agent results embedded

**Response** (next agent):
```json
{
  "message": "Use the backend-developer-moderate subagent to:\n1. Review previous results: {summary}\n2. Implement authentication endpoints..."
}
```

**Response** (workflow complete):
```json
{
  "message": "Workflow complete. All agents finished successfully.\n\nSummary: Architecture designed, backend implemented, code reviewed."
}
```

#### 3.2.3 POST /hooks/stop

**Purpose**: Cleanup orphaned workflows (fires after **each agent completion**, not just session end)

**Trigger Behavior**: The Stop hook fires alongside PostToolUse after every agent execution. It is NOT an indicator of session termination or chain completion.

**Authentication**: `X-Hook-Secret` header (shared secret)

**Request**: Hook payload from Claude Code

**Response**: `200 OK` (no body, no message injection)

**Implementation Notes**:
- Query for ACTIVE workflows with stale timestamps (>5 minutes old)
- Mark truly orphaned workflows as FAILED
- Most invocations will find zero orphaned workflows (normal operation)
- Never returns message injection (always 200 OK)

---

### 3.3 Monitoring/Admin API Endpoints

#### 3.3.1 GET /api/workflows/{workflow_id}/status (Optional Monitoring)

**Purpose**: Query current workflow state and progress

**Access**: Public

**Request**: No body (workflow_id in URL path)

**Response (Success - 200)**:
```typescript
interface WorkflowStatusResponse {
  workflow_id: string;
  status: 'ACTIVE' | 'COMPLETED' | 'FAILED';
  chain_name: string;
  complexity: 'simple' | 'moderate' | 'complex';
  current_step: number;
  total_steps: number;
  completed_agents: Array<{
    role: string;
    step: number;
    status: string;
    completed_at: number;  // Unix timestamp (ms)
  }>;
  summary: string;  // Human-readable workflow progress
}
```

**Example**:
```json
{
  "workflow_id": "wf-abc123",
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
      "completed_at": 1734567890000
    }
  ],
  "summary": "Architecture design completed, backend implementation in progress"
}
```

**Response (Error - 404)**:
```json
{
  "error": {
    "code": "WORKFLOW_NOT_FOUND",
    "message": "Workflow wf-abc123 does not exist"
  }
}
```

---

#### 3.3.2 POST /api/workflows/{workflow_id}/transition (Admin Only)

**Purpose**: Administrative endpoint for manual workflow control (debugging, recovery, testing)

**Access**: Admin only (API key authentication - future)

**Request**:
```typescript
interface TransitionRequest {
  action: 'advance' | 'fail' | 'retry' | 'skip';
  reason: string;  // Required for audit trail
}
```

**Action Definitions**:

| Action | Effect | Use Case |
|--------|--------|----------|
| `advance` | Force next step (`current_step++`) | Skip broken agent, force progression |
| `fail` | Abort workflow (status=`FAILED`, stop chain) | Irrecoverable error, cancel workflow |
| `retry` | Re-run current agent (keep `current_step`, clear last result) | Agent gave bad output, want retry |
| `skip` | Jump to next without completing current (`current_step++`, mark `SKIPPED`) | Testing, bypass slow agent |

**Validation Rules** (zod):
```typescript
const TransitionRequestSchema = z.object({
  action: z.enum(['advance', 'fail', 'retry', 'skip']),
  reason: z.string().min(10).max(500),  // Require meaningful reason
});
```

**Response (Success - 200)**:
```json
{
  "workflow_id": "wf-abc123",
  "previous_step": 0,
  "current_step": 1,
  "next_agent": "backend-developer-moderate",
  "status": "ACTIVE",
  "message": "Transitioned to step 1 (backend-developer-moderate)"
}
```

**Response (Error - 403)**:
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Admin API key required"
  }
}
```

**Response (Error - 409)**:
```json
{
  "error": {
    "code": "INVALID_TRANSITION",
    "message": "Cannot advance: workflow already completed"
  }
}
```

**Audit Trail**: All transitions logged to `workflow_transitions` table with `reason` field

---

## 4. Development Practices

### 4.1 Commit Guidelines

**Format**: Use Conventional Commits

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:
- `feat` - New feature
- `fix` - Bug fix
- `refactor` - Code restructuring without behavior change
- `test` - Add or modify tests
- `docs` - Documentation changes
- `chore` - Build, tooling, dependencies
- `perf` - Performance improvement

**Frequency**: Commit every single feature or ~200 lines of changes

**Example**:
```
feat(orchestrator): implement chain resolver for workflow routing

- Add chain determination logic based on user prompt analysis
- Support all 9 workflow chains (backend-dev, frontend-dev, etc.)
- Include complexity level resolution (simple/moderate/complex)

Resolves: #12
```

### 4.2 Test-Driven Development (TDD)

**Approach**: Write unit tests **before** implementation

**Test Structure** (vitest):
```typescript
import { describe, it, expect } from 'vitest';

describe('ChainResolver', () => {
  it('should resolve backend-development chain for API implementation prompts', () => {
    // Arrange
    const prompt = 'Implement REST API for authentication';
    const resolver = new ChainResolver();

    // Act
    const result = resolver.resolve(prompt);

    // Assert
    expect(result.chain).toBe('backend-development');
    expect(result.complexity).toBe('moderate');
  });

  it('should default to moderate complexity for ambiguous prompts', () => {
    const prompt = 'Build user profile feature';
    const result = resolver.resolve(prompt);

    expect(result.complexity).toBe('moderate');
  });
});
```

**Coverage Requirements**:
- Minimum test coverage: **80%** statement coverage
- Test types: Unit tests + Integration tests for API endpoints

**Integration Test Example** (supertest):
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';

// Note: POST /api/workflows/:id/results is DEPRECATED in favor of PostToolUse hook (synchronous orchestration)
// Agent results are now submitted via PostToolUse hook payload, not separate API call
// This endpoint remains optional for backward compatibility or manual testing only

describe('GET /api/workflows/:id/status', () => {
  let workflowId: string;

  beforeAll(async () => {
    // Create test workflow
    workflowId = await createTestWorkflow();
  });

  it('should return workflow status', async () => {
    const response = await request(app)
      .get(`/api/workflows/${workflowId}/status`);

    expect(response.status).toBe(200);
    expect(response.body.workflow_id).toBe(workflowId);
    expect(response.body.status).toMatch(/ACTIVE|COMPLETED|FAILED/);
  });

  it('should return 404 for non-existent workflow', async () => {
    const response = await request(app)
      .get('/api/workflows/invalid-id/status');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('WORKFLOW_NOT_FOUND');
  });
});

describe('POST /api/workflows/:id/transition (Admin)', () => {
  let workflowId: string;

  beforeAll(async () => {
    workflowId = await createTestWorkflow();
  });

  it('should advance workflow with valid API key', async () => {
    const response = await request(app)
      .post(`/api/workflows/${workflowId}/transition`)
      .set('Authorization', `Bearer ${process.env.API_KEY_ADMIN}`)
      .send({
        action: 'advance',
        reason: 'Manual advance for testing',
      });

    expect(response.status).toBe(200);
    expect(response.body.current_step).toBeGreaterThan(0);
  });

  it('should reject transition without API key', async () => {
    const response = await request(app)
      .post(`/api/workflows/${workflowId}/transition`)
      .send({
        action: 'advance',
        reason: 'Unauthorized attempt',
      });

    expect(response.status).toBe(401);
  });
});
```

### 4.3 Quality Checks

Run after **every change**:

| Check | Command | Purpose |
|-------|---------|---------|
| **Type Integrity** | `pnpm tsc --noEmit` | Catch type errors before runtime |
| **Test Regression** | `pnpm test` | Ensure all tests pass |
| **Linting** | `pnpm lint` | Enforce code style and catch errors |

**CI Pipeline** (GitHub Actions):
```yaml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm lint
      - run: pnpm tsc --noEmit
      - run: pnpm test
```

### 4.4 Pre-commit Hook (Recommended)

Install `husky` + `lint-staged`:

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.ts": [
      "eslint --fix",
      "prettier --write",
      "vitest related --run"
    ]
  }
}
```

---

## 5. Project Structure

```
orchestrator-v3/
├── src/
│   ├── config/
│   │   ├── database.ts          # Prisma client initialization
│   │   ├── env.ts               # Environment variable validation (zod)
│   │   └── logger.ts            # Pino logger setup
│   │
│   ├── models/
│   │   ├── workflow.ts          # Workflow domain model & types
│   │   ├── agent-result.ts      # AgentResult domain model
│   │   └── chain.ts             # Chain definitions & enums
│   │
│   ├── repositories/
│   │   ├── workflow.repository.ts     # Workflow CRUD operations
│   │   ├── agent-result.repository.ts # Agent result persistence
│   │   └── transition.repository.ts   # Transition audit log
│   │
│   ├── services/
│   │   ├── orchestrator.ts      # Core orchestration logic
│   │   ├── chain-resolver.ts    # Chain & complexity determination
│   │   ├── prompt-parser.ts     # User prompt analysis
│   │   └── state-manager.ts     # Workflow state transitions
│   │
│   ├── hooks/
│   │   ├── user-prompt-submit.ts   # UserPromptSubmit handler
│   │   ├── post-tool-use.ts        # PostToolUse handler (receives agent results)
│   │   └── stop.ts                 # Stop (cleanup) handler
│   │
│   ├── api/
│   │   ├── routes/
│   │   │   ├── workflows.ts        # GET /workflows/:id/status
│   │   │   ├── results.ts          # POST /workflows/:id/results
│   │   │   └── transitions.ts      # POST /workflows/:id/transition
│   │   ├── middleware/
│   │   │   ├── error-handler.ts    # Global error handler
│   │   │   ├── request-logger.ts   # Pino HTTP logger
│   │   │   └── auth.ts             # API key validation (future)
│   │   └── validators/
│   │       ├── results.validator.ts    # Zod schemas for results
│   │       └── transition.validator.ts # Zod schemas for transitions
│   │
│   ├── utils/
│   │   ├── id-generator.ts      # UUID generation for workflow IDs
│   │   ├── timestamp.ts         # Unix timestamp utilities
│   │   └── errors.ts            # Custom error classes
│   │
│   └── server.ts                # Express app setup & startup
│
├── prisma/
│   ├── schema.prisma            # Prisma schema definition
│   ├── migrations/              # Prisma migration files
│   └── seed.ts                  # Database seeding script
│
├── tests/
│   ├── unit/
│   │   ├── services/
│   │   │   ├── chain-resolver.test.ts
│   │   │   ├── prompt-parser.test.ts
│   │   │   └── state-manager.test.ts
│   │   └── repositories/
│   │       └── workflow.repository.test.ts
│   │
│   ├── integration/
│   │   ├── api/
│   │   │   ├── results.test.ts
│   │   │   ├── workflows.test.ts
│   │   │   └── transitions.test.ts
│   │   └── hooks/
│   │       ├── user-prompt-submit.test.ts
│   │       └── post-tool-use.test.ts
│   │
│   └── fixtures/
│       ├── workflows.json       # Test workflow data
│       └── prompts.json         # Test prompt examples
│
├── docs/
│   ├── PRD.md                   # Product requirements
│   ├── technical-spec.md        # This document
│   ├── architecture.md          # Architecture diagrams
│   ├── development-plan.md      # Implementation phases
│   └── WBS.md                   # Work breakdown structure
│
├── .env.example                 # Environment variable template
├── .env                         # Local environment (gitignored)
├── .eslintrc.json               # ESLint configuration
├── .prettierrc                  # Prettier configuration
├── tsconfig.json                # TypeScript configuration
├── vitest.config.ts             # Vitest configuration
├── package.json                 # Dependencies & scripts
└── pnpm-lock.yaml               # Lockfile
```

---

## 6. Error Handling

### 6.1 Error Categories

| Category | HTTP Status | Example |
|----------|-------------|---------|
| **Validation Error** | 400 | Invalid agent role, malformed JSON |
| **Not Found** | 404 | Workflow ID doesn't exist |
| **Conflict** | 409 | Workflow not ACTIVE, duplicate step submission |
| **Internal Error** | 500 | Database connection failure, unexpected exception |

### 6.2 Custom Error Classes

```typescript
// src/utils/errors.ts

export class ValidationError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
```

### 6.3 Global Error Handler

```typescript
// src/api/middleware/error-handler.ts

import { Request, Response, NextFunction } from 'express';
import { ValidationError, NotFoundError, ConflictError } from '../../utils/errors';
import { logger } from '../../config/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  logger.error({ err, req: { method: req.method, url: req.url } }, 'Request error');

  if (err instanceof ValidationError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message,
        details: err.details,
      },
    });
  }

  if (err instanceof NotFoundError) {
    return res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: err.message,
      },
    });
  }

  if (err instanceof ConflictError) {
    return res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: err.message,
      },
    });
  }

  // Unknown error - don't leak internals
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
```

### 6.4 Idempotency Handling

**Scenario**: Agent retries result submission due to network timeout

**Strategy**: Treat unique constraint violations as success (result already recorded)

```typescript
// src/repositories/agent-result.repository.ts

export async function saveAgentResult(data: AgentResultData): Promise<void> {
  try {
    await prisma.agentResult.create({ data });
  } catch (error) {
    if (error.code === 'P2002') {  // Prisma unique constraint violation
      // Idempotency: result already exists for this (workflow_id, step_number)
      logger.info({ workflowId: data.workflowId, stepNumber: data.stepNumber },
        'Agent result already recorded (idempotent)');
      return;  // Treat as success
    }
    throw error;
  }
}
```

---

## 7. Performance Requirements

### 7.1 Latency Targets

| Operation | Target | Measurement |
|-----------|--------|-------------|
| **Hook Response** | <500ms | UserPromptSubmit hook → first response |
| **Agent Transition** | <1s | SubagentStop hook → next agent prompt |
| **API Result Submission** | <200ms | POST /results → 200 OK |
| **DB Write** | <100ms | Single transaction with 3 writes (workflow + result + transition) |

### 7.2 Throughput Targets

- **Workflows per day**: 10,000 (single instance)
- **Concurrent workflows**: 50 ACTIVE workflows
- **Database size**: <100MB (10k workflows, 30k agent results)

### 7.3 Performance Optimization Strategies

**Database**:
- Indexes on `workflows.status`, `workflows.created_at`
- Prepared statements for frequent queries
- Connection pooling (not needed for SQLite, but for Redis migration)

**API**:
- Request validation caching (zod schemas compiled once)
- JSON parsing optimization (body-parser limits)
- HTTP keep-alive connections

**Hook Processing**:
- Pre-compile prompt templates
- Cache chain definitions in memory
- Async logging (don't block on I/O)

### 7.4 Monitoring & Metrics

**Key Metrics** (future - Prometheus):
- `corch_hook_duration_ms{hook_type}` - Hook processing latency
- `corch_workflow_total{chain_name, complexity, status}` - Workflow counts
- `corch_agent_duration_ms{agent_role, complexity}` - Agent execution time
- `corch_api_requests_total{endpoint, status}` - API request counts

**Alerting Thresholds**:
- Hook response >1s (p95)
- API errors >5% of requests
- ACTIVE workflows >100 (potential stale workflows)

---

## 8. Configuration Management

### 8.1 Environment Variables

```bash
# .env.example

# Server
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL="file:./dev.db"

# Logging
LOG_LEVEL=info

# Claude Code Integration
CLAUDE_CODE_HOOK_ENDPOINT=http://localhost:3000/hooks

# Admin (future)
ADMIN_API_KEY=your-secret-key-here
```

### 8.2 Configuration Validation

```typescript
// src/config/env.ts

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default('3000'),
  DATABASE_URL: z.string().min(1), // Prisma supports file:./dev.db format
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  ADMIN_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
```

---

## 9. References

- **PRD**: `docs/PRD.md` - Product requirements and business logic
- **Architecture**: `docs/architecture.md` - System diagrams and flows
- **Development Plan**: `docs/development-plan.md` - Implementation roadmap
- **Prisma Docs**: https://www.prisma.io/docs
- **Vitest Docs**: https://vitest.dev
- **Zod Docs**: https://zod.dev
- **Pino Docs**: https://getpino.io
