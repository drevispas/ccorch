# Claude Code Orchestrator – Detailed Development Plan

> **Document Concern**: WHEN (project timeline, phases)
>
> This document outlines the implementation roadmap with phases, workstreams, and deliverables. For product requirements, see `PRD.md`. For technical specifications, see `technical-spec.md`.

**Related Documents**:
- `01-product-PRD.md` - Product requirements (WHAT and WHY)
- `02-technical-spec.md` - Technical implementation details (HOW)
- `02-technical-architecture.md` - System architecture and sequence diagrams (STRUCTURE)
- `03-planning-development-plan.md` - Implementation phases and timeline (WHEN)
- `03-planning-WBS.md` - Granular work breakdown (TASKS)

## Table of Contents

1. [Prerequisites](#1-prerequisites)
   - [Claude Code Requirements](#11-claude-code-requirements)
   - [Development Environment](#12-development-environment)
   - [Hook Configuration Access](#13-hook-configuration-access)
2. [Context & Objectives](#2-context--objectives)
3. [Guiding Principles](#3-guiding-principles)
4. [Workstreams & Key Deliverables](#4-workstreams--key-deliverables)
5. [Phase Breakdown & Detailed Tasks](#5-phase-breakdown--detailed-tasks)
   - [Estimated Timelines](#51-estimated-timelines)
   - [PoC Phase – Hook/API Viability](#52-poc-phase--hookapi-viability)
   - [Phase 0 – Environment & Governance](#53-phase-0--environment--governance)
   - [Phase 1 – Persistence Foundation](#54-phase-1--persistence-foundation)
   - [Phase 2 – Orchestration Core](#55-phase-2--orchestration-core)
   - [Phase 3 – Hook Handler Integration](#56-phase-3--hook-handler-integration)
   - [Phase 4 – API & Administrative Surface](#57-phase-4--api--administrative-surface)
   - [Phase 5 – Observability & Operational Polish](#58-phase-5--observability--operational-polish)
6. [Milestones](#6-milestones)
7. [Testing & Quality Assurance Strategy](#7-testing--quality-assurance-strategy)
8. [Operational Considerations](#8-operational-considerations)
9. [Risk Register](#9-risk-register)
10. [Open Questions](#10-open-questions)
11. [Immediate Next Steps](#11-immediate-next-steps)

## 1. Prerequisites

### 1.1 Claude Code Requirements
- **Minimum Version**: Claude Code with hooks support enabled
- **Hook Feature Availability**: `UserPromptSubmit`, `PostToolUse`, `Stop` hooks must be available
- **Agent Definitions**: `.claude/agents/` directory populated with all required agent files:
  - `backend-architect-{simple,moderate,complex}.md`
  - `frontend-architect-{simple,moderate,complex}.md`
  - `java-backend-developer-{simple,moderate,complex}.md`
  - `nextjs-react-developer-{simple,moderate,complex}.md`
  - `code-reviewer-{simple,moderate,complex}.md`
  - `issue-detective-{simple,moderate,complex}.md`
  - `e2e-test-architect-{simple,moderate,complex}.md`

### 1.2 Development Environment
- **Node.js**: LTS version (v18+ recommended)
- **Package Manager**: pnpm (preferred), npm, or yarn
- **Database**: SQLite 3 (via Prisma ORM)
- **Git**: For version control and CI/CD

### 1.3 Hook Configuration Access
- Write access to `.claude/settings.json` for hook configuration
- Network access for CCOrch HTTP endpoints (localhost for development)

---

## 2. Context & Objectives
- **Scope**: Implement the multi-agent orchestration platform described in `docs/01-product-PRD.md`, including hook processing, workflow state management, and supporting APIs.
- **Primary Goals**:
  - Automate selection/sequencing of Claude Code subagents across backend-architect, frontend-architect, java-backend-developer, nextjs-react-developer, code-reviewer, issue-detective, and e2e-test-architect roles (§2, §3, §4).
  - Maintain durable workflow state with SQLite persistence, enabling retries, manual transitions, and auditability (§5, §10).
  - Deliver performant (<500 ms hook response) and observable operations with logging and metrics hooks (§8).
- **Success Metrics**: 100% coverage of defined workflow chains (§4.2), hook/API latency targets met, ≥80% automated test coverage, CI pipeline passes lint/type/test gates.

## 3. Guiding Principles
- Follow TDD and Conventional Commit practices outlined in technical-spec.md §4.
- Prefer deterministic, idempotent state transitions to survive hook retries or failures (§5.3, §5.5).
- Keep agent prompts and complexity levels synchronized with `.claude/agents/` catalogue (§3.1, §6).
- Design for future scaling (Redis migration, dynamic chains) by isolating persistence and orchestration logic (§9, §10.2).

## 4. Workstreams & Key Deliverables
| Workstream | Description | Primary Deliverables |
|------------|-------------|----------------------|
| PoC – Hook/API Viability | Minimal orchestrator + hook wiring to prove Claude hooks interact with CCOrch API | Lightweight HTTP server, mock workflow endpoint, Claude hook config, PoC validation report |
| Environment & Governance | Tooling, project scaffold, contributor guidance | pnpm/TypeScript skeleton, lint/test/type scripts, CONTRIBUTING, `.env.example` |
| Persistence Layer | Database schema, migrations, repository APIs | Prisma schema + migrations, seed scripts, repository unit tests |
| Orchestration Core | Prompt parsing, chain resolution, state manager | Parser/resolver modules, orchestrator service, decision logging |
| Hook Integration | Claude Code hooks implementation | `UserPromptSubmit`, `PostToolUse`, `Stop` handlers, prompt templates, integration tests |
| API Surface | API surface (public + admin endpoints) | Express routes, zod validation, supertest coverage, API docs |
| Observability & Ops | Logging, metrics, recovery, runbooks | Pino logging, metrics stubs, failure recovery routines, deployment/runbook docs |

## 5. Phase Breakdown & Detailed Tasks

**Phase Execution Order**: Phases must be completed sequentially in the order listed below. Each phase builds upon the artifacts and validations from the previous phase.

**Phase Dependencies**:
- **PoC → Phase 0**: PoC findings inform technology selections and CI setup
- **Phase 0 → Phase 1**: Project scaffold must exist before database implementation
- **Phase 1 → Phase 2**: Repository interfaces required for orchestration logic
- **Phase 2 → Phase 3**: Orchestrator core must be stable before hook integration
- **Phase 3 → Phase 4**: Hook handlers needed for API result submissions
- **Phase 4 → Phase 5**: Full system operational before observability layer

### 5.1 Estimated Timelines

| Phase | Duration | Cumulative |
|-------|----------|------------|
| **PoC** | 2-3 days | 2-3 days |
| **Phase 0** | 3-5 days | 5-8 days |
| **Phase 1** | 5-7 days | 10-15 days |
| **Phase 2** | 7-10 days | 17-25 days |
| **Phase 3** | 7-10 days | 24-35 days |
| **Phase 4** | 5-7 days | 29-42 days |
| **Phase 5** | 5-7 days | 34-49 days |
| **Total** | **34-49 days** | **(7-10 weeks)** |

*Note: Estimates assume single developer working full-time. Adjust for team size and part-time allocation.*

---

### 5.2 PoC Phase – Hook/API Viability
- **Objective**: Demonstrate Claude Code hooks can interact with a running CCOrch HTTP endpoint with minimal implementation before full build-out.
- **Language**: **TypeScript** (using `tsx` for execution) - Ensures consistency with production codebase from the start
- **Server Setup**: Stand up a minimal Express server (no framework overhead) exposing stubbed endpoints storing data in memory:
  - **Hook endpoints** (called by Claude Code via `.claude/settings.json`):
    - `POST /hooks/user-prompt-submit` - receives UserPromptSubmit hook payloads, **returns mock agent injection message** that Claude Code will display
    - `POST /hooks/post-tool-use` - receives PostToolUse hook payloads (with agent results), **returns mock next agent injection or completion message**
    - `POST /hooks/stop` - receives Stop hook payloads, returns 200 OK (no message injection)
  - **Monitoring endpoints** (optional for PoC):
    - `GET /api/workflows/{id}/status` - query workflow status
  - **Hook Response Format**: All hook endpoints must return JSON response with `message` field per Claude Code hooks spec:
    ```json
    {
      "message": "Use the backend-architect-moderate subagent to:\n1. Design backend system architecture"
    }
    ```
    Note: Agent results are submitted via PostToolUse hook payload, not separate API calls.
- **Hook Configuration**: Configure `.claude/settings.json` to call hook endpoints via `command` field using curl (see [Hook Guide](https://docs.claude.com/en/docs/claude-code/hooks-guide.md)).
- **Hook Capture**: Capture real `UserPromptSubmit` and `PostToolUse` payloads from Claude Code to understand actual request structure using one of these portable approaches:
  - **Method 1 (Recommended)**: Create a TypeScript script that reads stdin and logs the full JSON payload:
    ```typescript
    // capture-hook.ts
    import fs from 'fs';
    let data = '';
    process.stdin.on('data', (chunk) => data += chunk);
    process.stdin.on('end', () => {
      const payload = JSON.parse(data);
      fs.appendFileSync('./hook-payloads.log', JSON.stringify(payload, null, 2) + '\n---\n');
      process.stdout.write(JSON.stringify({ success: true }));
    });
    ```
    Configure in `.claude/settings.json`: `"command": "tsx capture-hook.ts"`
  - **Method 2**: Use `jq` with `tee` to log while preserving stdout: `jq '.' | tee -a hook-payloads.log && printf '{"success":true}'`
  - **Method 3**: Log incoming requests directly in the stub Express server with `console.log(JSON.stringify(req.body, null, 2))`
  - **Documentation**: After capturing real payloads, document the actual hook payload structures in `poc/README.md`:
    - Include sanitized sample payloads for `UserPromptSubmit` and `PostToolUse` hooks
    - Document field names, types, and structure observed from Claude Code
    - Note any unexpected fields or differences from hook documentation
    - **Document agent results structure in PostToolUse payload** - critical for Phase 3 implementation
    - This serves as reference for Phase 3 hook handler implementation
- **Test Session**: Run manual test proving complete hook-response-injection flow:
  1. **UserPromptSubmit Flow Test**:
     - User submits prompt to Claude Code
     - Claude Code sends hook payload to CCOrch `POST /hooks/user-prompt-submit`
     - CCOrch returns JSON response with `message` field containing agent injection
     - **Verify**: Claude Code displays the injected message to user
     - **Verify**: User sees the agent prompt instruction (e.g., "Use backend-architect-moderate subagent...")
  2. **PostToolUse Flow Test**:
     - Agent completes and Claude Code sends `POST /hooks/post-tool-use` (with agent results in payload)
     - CCOrch extracts results from payload, processes inline
     - CCOrch returns next agent injection message in hook response
     - **Verify**: Claude Code displays the next agent prompt to user
     - **Verify**: Workflow advances to next step (visible in CCOrch state)
     - **Verify**: Agent results visible in CCOrch memory (no separate API submission needed)
  3. **State Persistence Test**:
     - Verify workflow state changes reflected across consecutive hook calls
     - Query `GET /api/workflows/{id}/status` between steps to confirm state updates
- **PoC Report**: Capture findings in `poc/README.md` using success criteria format:
  - ✓ Hook round-trip successful (request → CCOrch → response)
  - ✓ Claude Code receives and displays injected prompts
  - ✓ Agent injection messages visible to user in Claude Code interface
  - ✓ State persistence across calls
  - ✓ Response latency acceptable (<500ms)
  - List limitations and risks for full implementation
- **Exit Criteria**: Express server running + real hook payloads captured + **Claude Code displays injected prompts** + documented PoC report (`poc/README.md`) with success criteria validated.

### 5.3 Phase 0 – Environment & Governance
- Scaffold TypeScript project using Express per technical-spec.md §1.1; align directory structure with technical-spec.md §5.
- Configure `tsconfig.json`, ESLint (`@typescript-eslint`), Prettier, Vitest, and nodemon/dev script.
- Add npm scripts: `pnpm lint`, `pnpm test`, `pnpm tsc --noEmit`, `pnpm dev`.
- Create `CONTRIBUTING.md` summarizing Conventional Commit format, test expectations, review process.
- Produce `.env.example` with placeholders for `PORT`, `DATABASE_URL`, Claude hook secrets.
- Set up GitHub Actions (or equivalent) pipeline running lint/type/test per technical-spec.md §4.3.
- **Exit Criteria**: CI green on scaffold repo, contributors oriented, base project compiles and runs.

### 5.4 Phase 1 – Persistence Foundation
- **ORM Selection**: Use Prisma (default per technical-spec.md §1.3); document rationale; initialize with SQLite datasource.
- **Schema Modeling**: Model tables `workflows`, `agent_results`, `workflow_transitions` matching technical-spec.md §2 including:
  - All field names, indexes, constraints
  - `session_id` field on `workflows` table with index for session-based correlation and cleanup
  - `UNIQUE (workflow_id, step_number)` on `agent_results` for idempotency
- **Repository Interface Design**: Abstract persistence layer to ease future Redis migration (§9, §10.2); define interface contracts for workflow/agent-results/transitions repositories.
- **Seed Data**: Generate migration(s) and seed script with representative **backend-development** workflow example.
- **DB Connector**: Implement in `src/config/database.ts` handling connection lifecycle and graceful shutdown.
- **Repository Modules**: Build in `src/models/*.ts` for workflows, agent results, transitions with query helpers for active workflows and audit retrieval.
- **Unit Tests**: Write Vitest tests covering CRUD operations, foreign keys, cascade deletes, status filters, and unique constraint violations.
- **Documentation**: Document database usage and migration commands in `docs/02-technical-database.md`.
- **Exit Criteria**: Migrations run cleanly, repositories tested with interface abstraction, seed data loads backend-development example, documentation updated.

### 5.5 Phase 2 – Orchestration Core
- Implement prompt parsing utility to extract intent, match backend/frontend keywords, and detect complexity per PRD §5.2 (tables and keyword modifiers).
- Build chain resolver service that maps intents to chains, applies backend/frontend fallback, and logs ambiguous prompts with severity levels.
- Develop state manager to create workflows, progress `current_step`, track statuses (`ACTIVE`, `COMPLETED`, `FAILED`), and enforce chain bounds.
- Define workflow ID generation strategy (use UUID v4 for global uniqueness, no ordering leaks, and collision resistance).
- Implement orchestrator coordinator orchestrating parser, resolver, and state manager interactions; ensure it produces agent prompt payloads per §6.
- Design context serialization strategy for passing previous agent results to next agent (per PRD §6.2: "Review previous results: {summary}"); include result summary extraction and template variable substitution.
- Add domain models/types for workflow context and agent tasks; validate using zod.
- Cover each module with unit and contract tests using mocked repositories; include negative cases (invalid prompt, chain exhaustion, failed agent state).
- **Exit Criteria**: Orchestrator service API stable with ≥80% coverage across modules, decision logging present.

### 5.6 Phase 3 – Hook Handler Integration
- **Hook Adapters**: Create hook adapters in `src/hooks/` for `UserPromptSubmit`, `PostToolUse`, and `Stop` matching PRD §5.1 behavior matrix.
- **Opt-in Trigger Filtering**: UserPromptSubmit handler checks for `\cco` or `\c2o` prefix (case insensitive) in user prompt; only activate orchestration when trigger present, otherwise return empty response.
- **HTTP Integration**: Implement Node.js HTTP endpoint handlers that receive hook payloads from `.claude/settings.json` command configuration (reference [Hook Guide](https://docs.claude.com/en/docs/claude-code/hooks-guide.md)).
- **Result Extraction**: PostToolUse handler extracts agent results from hook payload (no separate API submission needed).
- **PostToolUse Filtering**: Implement two-level filtering: (1) only process when `tool_name === 'Task'` (ignore other tools), (2) find active workflow by `session_id` from payload (ignore if no active workflow exists). Return empty response when filters don't match.
- **Idempotent Handling**: Use deduplication tokens to prevent duplicate transitions on hook retries; check `(workflow_id, step_number)` uniqueness before persisting agent results.
- **Prompt Templates**: Craft templates referencing correct agent role/complexity naming (§6.1, §6.2). Remove API submission reminders - results come via hook payload.
- **Configuration Validation**: Implement loader for hook secrets and orchestrator base URL; **validate configuration metadata at startup**: ensure all expected agent roles (backend-architect, frontend-architect, java-backend-developer, nextjs-react-developer, code-reviewer, issue-detective, e2e-test-architect) × complexity levels (simple, moderate, complex) = 21 total agent configurations are defined. Note: Agent definition files live in Claude Code's `.claude/agents/` directory on the user's machine, not on CCOrch server—CCOrch validates its internal config references, not filesystem paths.
- **Test Harness**: Develop dual-purpose test harness:
  - **Mock HTTP Server**: Simulates Claude Code sending hook payloads to CCOrch endpoints
  - **Payload Sender**: Script that generates and posts test hook payloads for manual testing
  - **Response Validation**: Verify hook responses conform to Claude Code expected format (validate response structure against hook guide requirements)
  - Document all three components in `docs/06-testing-harness.md`
- **Documentation**: Document hook setup (`.claude/settings.json` config, environment variables) in `docs/04-ops-hook-setup.md`.
- **Exit Criteria**: Hook handlers tested end-to-end, prompts generated accurately, configuration metadata validation operational, setup documentation validated.

### 5.7 Phase 4 – API & Administrative Surface
- **Express Routes**: Implement router modules in `src/api/` for:
  - `GET /api/workflows/{workflow_id}/status` (status polling - public, read-only for workflow monitoring)
  - `POST /api/workflows/{workflow_id}/transition` (manual control - admin only)
- **Note**: Agent result submission moved to PostToolUse hook (inline processing, no separate API endpoint needed)
- **Validation**: Use zod schemas aligning to PRD §5.4 for admin transition requests.
- **Authentication**: Implement **API key authentication** for admin endpoints (POST /transition only); GET /status remains public. Include rate limiting TODO for future enhancement.
- **API Documentation**: Produce reference in `docs/05-api-reference.md` (Markdown format) with request/response samples, error codes, and auth requirements per endpoint.
- **Integration Tests**: Write supertest suites covering success and failure paths, including validation errors and unauthorized access to admin endpoints.
- **Concurrent Workflow Isolation**: Test concurrent workflow isolation—ensure multiple simultaneous workflows don't interfere (verify separate workflow_id namespacing, no state leakage between workflows).
- **Exit Criteria**: API endpoints pass tests, API key auth guards admin-only operations, public endpoints accessible without credentials, concurrent workflows isolated, documentation published, error handling consistent.

### 5.8 Phase 5 – Observability & Operational Polish
- **Logging**: Integrate pino with request IDs (via `express-request-id`); log workflow IDs, chain decisions, response times.
- **Metrics Stubs**: Add logging placeholders for processing latency and error counts with `// TODO: Integrate Prometheus` comments (technical-spec.md §1.6); configure 7-day log retention for Loki stack.
- **Failure Recovery**: Implement strategies:
  - Retry policy for transient errors
  - Manual fail/skip operations via transition endpoint
  - Stale workflow cleanup triggered by `Stop` hook
  - Workflow archival policy: COMPLETED workflows retained for 30 days, FAILED workflows for 90 days (for debugging), then purged
- **Operator Runbook**: Draft in `docs/04-ops-runbook.md` detailing:
  - Local deployment steps
  - Environment variable management
  - DB backup/restore procedures
  - Admin transition usage examples
- **Deployment Automation**: Prepare script executing migrations, running tests, starting service; include smoke-test checklist.
- **Performance Tests**: Conduct sanity tests verifying hook response <500ms and transitions <1s under nominal load.
- **Exit Criteria**: Logging/metrics operational with Loki placeholder, recovery paths documented, deployment runbook validated, performance targets met.

## 6. Milestones
- **M0**: PoC complete – Claude hooks round-trip with stub API documented and approved.
- **M1**: Phase 0 complete – scaffold, tooling, CI, and contributor guide in place.
- **M2**: Phase 1 complete – schema/migrations tested, database layer stable.
- **M3**: Phase 2 complete – orchestrator logic validated by unit/contract suite.
- **M4**: Phases 3 & 4 complete – hooks and API pass end-to-end integration.
- **M5**: Phase 5 complete – observability, recovery, and deployment artifacts ready for release.

## 7. Testing & Quality Assurance Strategy
- **Unit Tests**: Mandatory for parser, resolver, state manager, repositories, API validators.
- **Integration Tests**: End-to-end simulations covering each workflow chain from `UserPromptSubmit` to completion, including failure branches.
- **Regression Tests**: Keyword classification set, chain fallback defaults, complexity scoring cases (simple/moderate/complex).
- **Coverage Targets**: ≥80% statement coverage enforced in CI; generate coverage report as artifact.
- **Static Analysis**: ESLint and TypeScript `--noEmit` gate every PR.
- **Pre-commit (optional)**: Husky + lint-staged executing ESLint, Prettier, and Vitest related tests per technical-spec.md §4.4.

## 8. Operational Considerations
- **Configuration Management**: Centralize environment variables, document defaults, and add runtime validation.
- **Security**:
  - Implement API key authentication for admin endpoints with future enhancement path; store secrets outside repo
  - **Hook Authentication**: Validate hook requests originate from authorized Claude Code instances using shared secret or HMAC signatures (prevent unauthorized workflow creation)
- **Error Propagation**: CCOrch errors communicated back to Claude Code via hook response with standardized error codes (4xx client errors, 5xx server errors)
- **Scalability Path**: Abstract persistence layer to ease future Redis migration; monitor SQLite locks and plan horizontal scaling backlog (§9, §10.2).
- **Documentation**: Maintain `docs/` for schema diagrams, API guide, hook setup, runbook, and troubleshooting.

## 9. Risk Register
| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Prompt misclassification leads to wrong agent chain | Medium | Medium | Expand keyword taxonomy, add telemetry, provide manual override workflow. |
| Hook retries duplicate workflow steps | High | Medium | Enforce unique `(workflow_id, step_number)` constraint, idempotent updates, detect replay tokens. |
| SQLite contention at higher concurrency | Medium | Low | Monitor via metrics, batch writes, prepare Redis migration plan. |
| Drift between `.claude/agents/` prompts and orchestrator templates | Medium | Medium | Add config validation ensuring all 21 agent configurations (7 roles × 3 complexity) are defined; monitor template naming drift via telemetry. |
| Missing Claude hook credentials blocks integration testing | High | Medium | Secure credentials early, provide local mock server fallback. |

## 10. Open Questions
- Confirm final choice between Express vs Fastify and Prisma vs Drizzle to avoid rework (Phase 0 decision).
  - Express, Prisma
- Determine hosting environment (local, containerized, serverless) to tailor deployment scripts.
  - local
- Clarify authentication requirements for admin transition endpoint (API key, OAuth, or basic auth stub?).
  - API key
- Define log retention and monitoring stack for production (CloudWatch, ELK, etc.).
  - 7 days. Loki stack

## 11. Immediate Next Steps
1. Execute PoC phase: spin up stub server, configure hooks, document results.
2. Ratify technology selections and CI environment informed by PoC findings.
3. Kick off Phase 0 tasks; schedule design reviews after each milestone.
4. Coordinate with Claude Code operations to provision hook credentials and callback URL.
5. Set up backlog tracking (Jira/Linear) aligned with phases and epics above.
