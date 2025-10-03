# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Claude Code Orchestrator (CCOrch)** is an intelligent agent coordination system that intercepts Claude Code interactions via hooks and orchestrates multi-agent workflows based on task complexity and role requirements.

The orchestrator manages chains of specialized agents (architect, backend-developer, frontend-developer, reviewer, debugger) at varying complexity levels (simple, moderate, complex) to automate complex development workflows without manual agent switching.

## Architecture

### Core Components

**Orchestration Pipeline**: User prompt → Intent parser → Chain resolver → State manager → Agent injection → Result collection → Transition logic

**Hook Integration**: CCOrch responds to three Claude Code hooks:
- `UserPromptSubmit`: Analyzes user intent, selects agent chain, injects first agent prompt
- `SubagentStop`: Receives agent results via API, determines next agent, continues or completes chain
- `Stop`: Cleanup for orphaned workflows (no message injection)

**State Persistence**: SQLite database with three tables:
- `workflows`: Main workflow state (chain_name, complexity, current_step, status)
- `agent_results`: Agent execution outputs (JSON results, step_number, status)
- `workflow_transitions`: Audit log of state changes (from_step, to_step, reason)

**API Surface**:
- `POST /api/workflows/{id}/results`: Agents submit execution results (public)
- `GET /api/workflows/{id}/status`: Query workflow progress (public)
- `POST /api/workflows/{id}/transition`: Admin control for manual fail/skip/retry (API key auth)

### Workflow Chains

| Chain | Agent Sequence |
|-------|----------------|
| `backend-development` | architect → backend-developer → reviewer |
| `frontend-development` | architect → frontend-developer → reviewer |
| `debug` | debugger → (backend/frontend)-developer → reviewer |
| `review` | reviewer → (backend/frontend)-developer |
| `design-only` | architect |
| `backend-only` | backend-developer |
| `frontend-only` | frontend-developer |
| `review-only` | reviewer |
| `debug-only` | debugger |

**Backend/Frontend Selection**: Keyword analysis (`java`, `api`, `database` → backend; `ui`, `component`, `react` → frontend; default: backend)

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
- **Logging**: pino + express-request-id
- **Testing**: vitest + supertest
- **Process Manager**: pm2 (production)

## Development Workflow

### Commit Guidelines

**Format**: Conventional Commits
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`

**Frequency**: Commit every single feature or ~200 lines

**Example**:
```
feat(orchestrator): implement chain resolver for workflow routing

- Add chain determination logic based on user prompt analysis
- Support all 9 workflow chains (backend-dev, frontend-dev, etc.)
- Include complexity level resolution (simple/moderate/complex)

Resolves: #12
```

### Test-Driven Development (TDD)

Write unit tests **before** implementation:
```typescript
describe('ChainResolver', () => {
  it('should resolve backend-development chain for API implementation prompts', () => {
    const prompt = 'Implement REST API for authentication';
    const result = chainResolver.resolve(prompt);
    expect(result.chain).toBe('backend-development');
    expect(result.complexity).toBe('moderate');
  });
});
```

**Coverage Target**: ≥80% statement coverage

### Quality Checks

Run after **every change**:
- Type integrity: `pnpm tsc --noEmit`
- Test regression: `pnpm test`
- Linting: `pnpm lint`

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
- 5 roles (architect, backend-developer, frontend-developer, reviewer, debugger)
- 3 complexity levels (simple, moderate, complex)
- Total: 15 agent configurations

Note: Agent definition files (`.claude/agents/*.md`) live in Claude Code's directory on the user's machine. CCOrch validates its internal config references, not filesystem paths.

## Project Structure

```
orchestrator-v3/
├── src/
│   ├── config/          # Database connection, env config
│   ├── models/          # Workflow, agent-result, transition models
│   ├── services/        # Orchestrator, chain-resolver, state-manager
│   ├── hooks/           # user-prompt-submit, subagent-stop handlers
│   ├── api/             # Express routes (workflows, results)
│   ├── utils/           # Prompt parser, logger
│   └── server.ts        # Main entry point
├── tests/               # Unit and integration tests
├── prisma/              # Schema and migrations
│   └── schema.prisma
├── docs/                # PRD, development plan, API reference
└── .env                 # Environment variables (not in repo)
```

## Common Development Tasks

This section will be populated as the codebase is implemented. Initial tasks from the development plan:

**PoC Phase**: Validate Claude Code hooks can interact with CCOrch HTTP endpoints
**Phase 0**: Set up project scaffold, tooling, CI/CD
**Phase 1**: Implement database schema, migrations, repository layer
**Phase 2**: Build orchestration core (parser, resolver, state manager)
**Phase 3**: Integrate hook handlers
**Phase 4**: Implement API endpoints
**Phase 5**: Add observability and operational polish

## Documentation Structure

CCOrch documentation is organized by concern:

| Document | Concern | Audience | Content |
|----------|---------|----------|---------|
| **`docs/PRD.md`** | WHAT & WHY | Product managers, stakeholders | Product vision, requirements, business logic, workflow chains |
| **`docs/technical-spec.md`** | HOW | Developers, architects | Technology stack, database schema, API specs, development practices |
| **`docs/architecture.md`** | STRUCTURE | Technical team | System architecture diagrams, sequence flows, component interactions |
| **`docs/development-plan.md`** | WHEN | Project managers, developers | Implementation phases, workstreams, timeline, deliverables |
| **`docs/WBS.md`** | TASKS | Developers | Granular task breakdown with acceptance criteria and estimates |

**Quick References**:
- Product requirements → `docs/PRD.md`
- Technical implementation → `docs/technical-spec.md`
- Architecture diagrams → `docs/architecture.md`
- Development phases → `docs/development-plan.md`
- Task checklist → `docs/WBS.md`

## External References

- Claude Code Hooks Guide: https://docs.claude.com/en/docs/claude-code/hooks-guide.md
- Hook Reference: https://docs.claude.com/en/docs/claude-code/hooks.md
- Subagent Reference: https://docs.claude.com/en/docs/claude-code/sub-agents.md