# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Claude Code Orchestrator (CCOrch)** is an intelligent agent coordination system that intercepts Claude Code interactions via hooks and orchestrates multi-agent workflows based on task complexity and role requirements.

The orchestrator manages chains of specialized agents (backend-architect, frontend-architect, java-backend-developer, nextjs-react-developer, code-reviewer, issue-detective, e2e-test-architect) at varying complexity levels (simple, moderate, complex) to automate complex development workflows without manual agent switching.

## Opt-in Trigger System

CCOrch uses an **opt-in activation model** to avoid interfering with normal Claude Code usage:

**Trigger Patterns**: Users must prefix prompts with `\cco` or `\c2o` (case insensitive) followed by whitespace
- Example: `\cco Implement REST API for user authentication`
- Example: `\C2O Debug performance issues in the database layer`

**Behavior**:
- **With trigger**: UserPromptSubmit hook activates orchestration, injects first agent prompt
- **Without trigger**: Hook passes through silently, Claude Code operates normally

This ensures CCOrch only activates when explicitly requested by the user.

## Architecture

### Core Components

**Orchestration Pipeline**: User prompt → Intent parser → Chain resolver → State manager → Agent injection → Result collection → Transition logic

**Hook Integration**: CCOrch responds to three Claude Code hooks:
- `UserPromptSubmit`: Analyzes user intent, selects agent chain, injects first agent prompt (opt-in via `\cco` or `\c2o` trigger)
- `PostToolUse`: Extracts agent results from Task tool output, determines next agent, continues or completes chain
- `Stop`: Cleanup for orphaned workflows (no message injection)

**State Persistence**: SQLite database with three tables:
- `workflows`: Main workflow state (chain_name, complexity, current_step, status)
- `agent_results`: Agent execution outputs (JSON results, step_number, status)
- `workflow_transitions`: Audit log of state changes (from_step, to_step, reason)

**API Surface**:
- `GET /api/workflows/:id/status`: Query workflow progress (public)
- `POST /api/workflows/:id/transition`: Admin control for manual fail/skip/retry (API key auth)

### Workflow Chains

CCOrch supports 9 workflow chains organized by task type:
- **Full Development**: `backend-development`, `frontend-development` (architect → developer → reviewer)
- **Debug**: `debug` (issue-detective → developer → reviewer)
- **Review**: `review` (code-reviewer → developer)
- **Single-Role**: `backend-only`, `frontend-only`, `backend-design-only`, `frontend-design-only`, `review-only`, `debug-only`

**Backend/Frontend Selection**: Keyword analysis (`java`, `api`, `database` → backend; `ui`, `component`, `react` → frontend; default: backend)

See `docs/01-product-PRD.md` for complete chain definitions and agent sequences.

### Complexity Determination

**Scoring Factors**:
- **Scope**: Single file (simple) | 2-5 files (moderate) | Multi-module (complex)
- **Dependencies**: None (simple) | 1-2 integrations (moderate) | Multiple services (complex)
- **Risk**: No breaking changes (simple) | Backward compatible (moderate) | Schema/API changes (complex)

**Keyword Modifiers**:
- Simple: `quick`, `fix`, `add`, `rename`, `dummy`, `basic`, `single`
- Complex: `whole`, `complete`, `design`, `architect`, `refactor`, `migrate`, `enterprise`, `system-wide`
- Default: `moderate` if ambiguous

## Technology Stack

- **Runtime**: Node.js (LTS), TypeScript
- **Web Framework**: Express.js
- **Database**: SQLite (Prisma ORM)
- **Validation**: zod
- **Testing**: vitest + supertest

## Design Principles

**Idempotency**: All hook handlers and API endpoints must handle retries gracefully
- Unique constraints on `(workflow_id, step_number)` prevent duplicate agent results
- Deduplication tokens prevent duplicate state transitions
- Check workflow status before state changes

**Repository Pattern**: Abstract all data access through repository interfaces
- Enables future migration from SQLite to Redis
- All database operations via `IWorkflowRepository`, `IAgentResultRepository`, `IWorkflowTransitionRepository`
- No direct Prisma calls outside repository layer

**State Machine Guarantees**: Workflow state transitions must be valid and auditable
- Only valid transitions allowed (e.g., ACTIVE → COMPLETED, ACTIVE → FAILED)
- All transitions logged in `workflow_transitions` table with reason
- State manager enforces transition rules

**Error Context Preservation**: Wrap external errors with domain context
- Prisma errors wrapped with workflow/agent context
- Network errors include workflow ID and step number
- All errors logged with structured data for debugging

**Dependency Injection**: Components receive dependencies via constructor
- Facilitates testing with mocks
- Clear dependency graph (e.g., Orchestrator depends on Parser, Resolver, StateManager)
- No global state or singletons

## Key Implementation Details

### Database Schema

**Workflows Table**: Stores main workflow state
- Primary key: `id` (TEXT, UUID)
- Key fields: `user_prompt`, `chain_name`, `complexity`, `current_step`, `status`
- Status values: `ACTIVE`, `COMPLETED`, `FAILED`

**Agent Results Table**: Stores agent execution outputs
- Primary key: `id` (INTEGER AUTOINCREMENT)
- Unique constraint: `(workflow_id, step_number)` for idempotency
- JSON results field: `{ summary, design?, files_modified?, issues_found?, recommendations? }`

**Workflow Transitions Table**: Audit log
- Tracks: `from_step`, `to_step`, `from_agent`, `to_agent`, `reason`
- Used for debugging and admin transitions

### Idempotency Patterns

**Hook Retries**: Check `(workflow_id, step_number)` uniqueness before persisting agent results
**Deduplication Tokens**: Prevent duplicate transitions on hook retries
**State Validation**: Verify workflow status before state changes

### Configuration Validation

At startup, validate that all expected agent configurations exist:
- 7 roles (backend-architect, frontend-architect, java-backend-developer, nextjs-react-developer, code-reviewer, issue-detective, e2e-test-architect)
- 3 complexity levels (simple, moderate, complex)
- Total: 21 agent configurations

Note: Agent definition files (`.claude/agents/*.md`) live in Claude Code's directory on the user's machine. CCOrch validates its internal config references, not filesystem paths.

### Anti-patterns & Gotchas

**Don't bypass the state manager**: All state changes must go through `StateManager`
- Direct Prisma writes skip validation and audit logging
- State manager ensures valid transitions and records reasons

**Don't assume hook calls are unique**: Claude Code may retry hooks on failure
- Always check `(workflow_id, step_number)` before inserting agent results
- Use deduplication tokens for transitions
- Expect same hook payload multiple times

**Don't skip transition validation**: Invalid transitions corrupt workflow state
- Verify current status before state changes
- Use state manager's transition methods, not direct updates
- Log transition failures for debugging

**Agent role names must match exactly**: Case-sensitive, must align with `.claude/agents/*.md`
- `backend-architect-simple` (correct) vs `backend_architect_simple` (wrong)
- Mismatches cause agent resolution failures
- Validate against config at startup

**Workflow ID is UUID, not integer**: Type mismatches cause lookup failures
- Database uses TEXT for workflow.id
- API expects string UUIDs, not numeric IDs

## Component Interactions

**Orchestration Flow**:
1. `UserPromptSubmit` hook → Check for `\cco` or `\c2o` trigger
2. `PromptParser` analyzes intent
3. `ChainResolver` determines workflow chain + complexity
4. `StateManager` creates workflow record (status: ACTIVE)
5. Hook handler injects first agent prompt via message injection
6. Agent executes as Task tool
7. `PostToolUse` hook → Extract agent results from `tool_response.stdout`
8. `StateManager` checks for next step
9. If more steps: inject next agent prompt, goto 6
10. If done: `StateManager` updates status to COMPLETED

**Hook-to-Agent Feedback Loop**:
- `UserPromptSubmit` hook initiates workflow, injects first agent prompt
- Agent executes as Task tool invocation
- `PostToolUse` hook extracts results from tool output, determines next step
- State manager coordinates workflow progression
- Session ID correlates hook events to active workflows

**Key File Locations**:
- Prompt parsing: `src/services/prompt-parser.ts`
- Chain resolution: `src/services/chain-resolver.ts`
- State management: `src/services/state-manager.ts`
- Hook handlers: `src/hooks/user-prompt-submit.ts`, `src/hooks/post-tool-use.ts`, `src/hooks/stop.ts`
- API routes: `src/api/workflows.ts`
- Orchestrator: `src/services/orchestrator.ts`

## Project Structure

```
/
├── src/
│   ├── config/          # Database connection, env config
│   ├── models/          # Workflow, agent-result, transition models
│   ├── services/        # Orchestrator, chain-resolver, state-manager
│   ├── hooks/           # user-prompt-submit, post-tool-use, stop handlers
│   ├── api/             # Express routes (workflows, results)
│   ├── middleware/      # Express middleware (auth, error handling)
│   ├── utils/           # Helpers (logger, parser, templates, metrics)
│   ├── types/           # TypeScript type definitions
│   └── server.ts        # Main entry point
├── tests/               # Unit and integration tests
├── prisma/              # Schema and migrations
│   └── schema.prisma
├── docs/                # PRD, development plan, API reference
└── .env                 # Environment variables (not in repo)
```

## Common Development Tasks

### Adding a New Workflow Chain

1. Update `ChainResolver.resolve()` in `src/services/chain-resolver.ts`
   - Add chain detection logic based on keywords
   - Define agent sequence for the new chain
2. Update chain validation in `StateManager` to allow new chain name
3. Add integration test in `tests/services/chain-resolver.test.ts`
4. Document chain in `docs/01-product-PRD.md`

### Adding a New Agent Role

1. Add new role to `AgentRole` enum in `src/types/workflow.ts`
2. Ensure agent definition file exists: `.claude/agents/{role}-{complexity}.md`
3. Update config validation in `src/config/validator.ts`
   - Verification automatically includes new role from enum
   - Ensure all 3 complexity levels exist (simple, moderate, complex)
4. Update chain definitions in `ChainResolver` if needed
5. Add unit tests for role resolution

### Testing Hook Integration

**Unit Tests**: Mock hook events and verify state transitions
```typescript
// Test UserPromptSubmit hook creates workflow
const mockEvent = { userPrompt: 'Implement REST API', sessionId: 'abc' };
await userPromptSubmitHandler(mockEvent);
// Verify workflow created with correct chain
```

**Integration Tests**: Use test harness in `tests/hooks/test-harness.ts`
- Simulates full hook → API → hook cycle
- Validates idempotency with retries
- Checks message injection format

### Debugging State Issues

1. Check `workflow_transitions` table for audit trail
2. Verify workflow status matches expected state machine
3. Check for duplicate `(workflow_id, step_number)` in agent_results
4. Review logs for state validation errors
5. Use `GET /api/workflows/{id}/status` to inspect current state