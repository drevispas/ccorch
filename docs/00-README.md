# CCOrch Documentation Map

This document provides a guide to all CCOrch documentation files, organized by purpose and audience.

## Quick Reference

| Document | Purpose | Primary Audience | When to Read |
|----------|---------|------------------|--------------|
| **[01-product-PRD.md](#01-product-prd)** | Product requirements & business logic | Product managers, stakeholders | First - understand WHAT and WHY |
| **[02-technical-spec.md](#02-technical-spec)** | Implementation details & technology stack | Developers, architects | Second - understand HOW |
| **[02-technical-architecture.md](#02-technical-architecture)** | System architecture & component design | Technical team | After PRD - understand STRUCTURE |
| **[03-planning-development-plan.md](#03-planning-development-plan)** | Implementation phases & timeline | Project managers, developers | For planning - understand WHEN |
| **[03-planning-WBS.md](#03-planning-wbs)** | Detailed task breakdown | Developers | For execution - understand TASKS |
| **[04-ops-hook-setup.md](#04-ops-hook-setup)** | Claude Code hooks configuration | Operators, developers | For deployment - setup instructions |
| **[05-api-reference.md](#05-api-reference)** | API endpoints specification | API consumers, frontend devs | For integration - API contracts |
| **[02-technical-database.md](#02-technical-database)** | Database schema & data model | Backend developers, DBAs | For data layer - schema details |
| **[04-ops-logging.md](#04-ops-logging)** | Logging conventions & formats | Operators, SREs | For observability - log analysis |
| **[04-ops-runbook.md](#04-ops-runbook)** | Operational procedures | SREs, operators | For operations - incident response |
| **[06-testing-smoke-tests.md](#06-testing-smoke-tests)** | Quick validation tests | QA, operators | For verification - health checks |
| **[06-testing-e2e-results.md](#06-testing-e2e-results)** | End-to-end test results | QA, developers | For validation - test reports |
| **[06-testing-release-checklist.md](#06-testing-release-checklist)** | Pre-release validation steps | Release managers | Before release - quality gates |
| **[06-testing-harness.md](#06-testing-harness)** | Testing infrastructure | Test engineers | For testing - test setup |
| **[poc/README.md](#pocreadmemd)** | PoC validation & architecture decisions | Developers, architects | To understand validated approaches |
| **[CLAUDE.md](#claudemd)** | AI assistant project instructions | Claude Code AI | Auto-loaded by Claude Code |
| **[CONTRIBUTING.md](#contributingmd)** | Developer contribution guidelines | Contributors | Before contributing code |

---

## Documentation by Concern

### 1. Product & Business Logic

#### 01-product-PRD.md
- **Full Name**: Product Requirements Document
- **Size**: ~21 KB
- **Purpose**: Defines WHAT CCOrch does and WHY it exists
- **Key Sections**:
  - Product vision and goals
  - Workflow chains (backend-development, frontend-development, debug, etc.)
  - Business requirements and use cases
  - Success criteria
- **Read This**: Before starting any development work
- **Dependencies**: None (start here)

---

### 2. Technical Implementation

#### 02-technical-spec.md
- **Full Name**: Technical Specification
- **Size**: ~44 KB
- **Purpose**: Defines HOW CCOrch is built
- **Key Sections**:
  - Technology stack (Node.js, TypeScript, Express, Prisma)
  - Database schema details
  - API specifications
  - Development practices (TDD, testing, commits)
  - Non-functional requirements
- **Read This**: When implementing features or making technical decisions
- **Dependencies**: 01-product-PRD.md (understand requirements first)

#### 02-technical-architecture.md
- **Full Name**: Architecture Document
- **Size**: ~36 KB
- **Purpose**: Defines system STRUCTURE and component interactions
- **Key Sections**:
  - High-level system architecture diagrams
  - Component interactions and data flow
  - Hook processing sequences
  - Database entity relationships
  - Deployment architecture
- **Read This**: To understand how all pieces fit together
- **Dependencies**: 01-product-PRD.md, 02-technical-spec.md

#### 02-technical-database.md
- **Full Name**: Database Documentation
- **Size**: ~14 KB
- **Purpose**: Detailed database schema and data model
- **Key Sections**:
  - Table schemas (workflows, agent_results, workflow_transitions)
  - Indexes and constraints
  - Relationships and foreign keys
  - Migration strategies
  - Query patterns
- **Read This**: When working with data persistence layer
- **Dependencies**: 02-technical-spec.md (understand data requirements)

---

### 3. Development & Planning

#### 03-planning-development-plan.md
- **Full Name**: Development Plan
- **Size**: ~25 KB
- **Purpose**: Defines WHEN features are implemented (phases & timeline)
- **Key Sections**:
  - Phase 0: Project setup
  - Phase 1: Database layer
  - Phase 2: Orchestration core
  - Phase 3: Hook integration
  - Phase 4: API endpoints
  - Phase 5: Observability
  - Phase 6: Launch readiness
- **Read This**: To understand project timeline and current progress
- **Dependencies**: 01-product-PRD.md (understand scope first)

#### 03-planning-WBS.md
- **Full Name**: Work Breakdown Structure
- **Size**: ~173 KB (most detailed document)
- **Purpose**: Granular TASKS breakdown with acceptance criteria
- **Key Sections**:
  - Task hierarchy for each phase
  - Acceptance criteria for each task
  - Time estimates
  - Dependencies between tasks
- **Read This**: When picking up specific implementation tasks
- **Dependencies**: 03-planning-development-plan.md (understand phases first)

---

### 4. Deployment & Operations

#### 04-ops-hook-setup.md
- **Full Name**: Hook Setup Guide
- **Size**: ~18 KB
- **Purpose**: Instructions for configuring Claude Code hooks
- **Key Sections**:
  - `.claude/settings.json` configuration
  - Hook endpoint setup
  - Environment variables
  - Testing hook integration
  - Troubleshooting
- **Read This**: When deploying CCOrch or debugging hook issues
- **Dependencies**: 02-technical-spec.md (understand hook architecture)

#### 04-ops-runbook.md
- **Full Name**: Operational Runbook
- **Size**: ~13 KB
- **Purpose**: Day-to-day operational procedures
- **Key Sections**:
  - Starting/stopping the service
  - Health checks
  - Common issues and resolutions
  - Incident response procedures
  - Monitoring and alerting
- **Read This**: For day-to-day operations and incident response
- **Dependencies**: 04-ops-logging.md (understand logs), 02-technical-architecture.md (understand system)

#### 04-ops-logging.md
- **Full Name**: Logging Documentation
- **Size**: ~11 KB
- **Purpose**: Logging conventions, formats, and log analysis
- **Key Sections**:
  - Log levels (DEBUG, INFO, WARN, ERROR)
  - Structured logging format (JSON)
  - Request tracing with requestId and workflowId
  - Log aggregation and analysis
  - Example log queries
- **Read This**: When debugging or analyzing system behavior
- **Dependencies**: None (reference material)

---

### 5. API & Integration

#### 05-api-reference.md
- **Full Name**: API Reference
- **Size**: ~11 KB
- **Purpose**: Complete API endpoint specifications
- **Key Sections**:
  - Hook endpoints (`/hooks/*`)
  - Workflow endpoints (`/api/workflows/*`)
  - Request/response schemas
  - Error codes and handling
  - Authentication (X-Hook-Secret header)
- **Read This**: When integrating with CCOrch API
- **Dependencies**: 02-technical-spec.md (understand API design)

---

### 6. Testing & Quality

#### 06-testing-harness.md
- **Full Name**: Test Harness Documentation
- **Size**: ~10 KB
- **Purpose**: Testing infrastructure and mock server setup
- **Key Sections**:
  - Mock Claude Code server
  - Test payload generation
  - Integration test setup
  - Hook simulation
- **Read This**: When writing or debugging tests
- **Dependencies**: 04-ops-hook-setup.md (understand hook structure)

#### 06-testing-smoke-tests.md
- **Full Name**: Smoke Test Suite
- **Size**: ~9 KB
- **Purpose**: Quick validation tests for basic functionality
- **Key Sections**:
  - Server health checks
  - API endpoint smoke tests
  - Database connectivity tests
  - Hook endpoint validation
- **Read This**: After deployment to verify basic functionality
- **Dependencies**: 05-api-reference.md (know endpoints to test)

#### 06-testing-e2e-results.md
- **Full Name**: End-to-End Test Results
- **Size**: ~6.5 KB
- **Purpose**: Real Claude Code hook integration test results
- **Key Sections**:
  - Phase 1: Real hook payload capture
  - Phase 2: UserPromptSubmit hook validation
  - Phase 3: Message injection verification
  - Phase 4: Full workflow execution
  - Known issues and lessons learned
- **Read This**: To understand real-world hook behavior and test outcomes
- **Dependencies**: 04-ops-hook-setup.md (understand hook configuration)

#### 06-testing-release-checklist.md
- **Full Name**: Release Checklist
- **Size**: ~9 KB
- **Purpose**: Pre-release quality gates and validation
- **Key Sections**:
  - Code quality checks (tests, coverage, linting)
  - Functional validation (all workflows)
  - Security review
  - Documentation review
  - Deployment readiness
- **Read This**: Before every release to production
- **Dependencies**: All documentation (comprehensive checklist)

---

### 7. Proof of Concept & Validation

#### poc/README.md
- **Full Name**: Proof of Concept Documentation
- **Size**: ~23 KB
- **Purpose**: PoC validation results and architecture decisions
- **Key Sections**:
  - Production architecture decisions (PostToolUse vs SubagentStop)
  - Hook payload structure validation
  - Performance measurements (~47ms average latency)
  - Opt-in trigger system validation
  - Session-based correlation testing
  - Real Claude Code hook integration results
- **Read This**: To understand validated architecture and why specific approaches were chosen
- **Dependencies**: None (historical validation record)

---

### 8. Root-Level Documentation

These files live in the repository root and serve specific purposes:

#### CLAUDE.md
- **Purpose**: Project instructions for Claude Code (AI assistant)
- **Audience**: Claude Code AI assistant
- **Contents**:
  - Project overview and architecture
  - Opt-in trigger system (`\cco`, `\c2o`)
  - Design principles (idempotency, repository pattern, etc.)
  - Component interactions and file locations
  - Common development tasks
  - Anti-patterns and gotchas
- **Read This**: To understand what guidance Claude Code receives when working on this codebase

#### CONTRIBUTING.md
- **Purpose**: Developer contribution guidelines
- **Audience**: Human contributors
- **Contents**:
  - Conventional Commits format
  - TDD workflow (red-green-refactor)
  - Quality checklist (lint, type-check, test)
  - PR review process
  - Code style guidelines (naming, structure)
  - Architecture patterns (repository, DI, error handling)
- **Read This**: Before contributing to the codebase

---

## Reading Order by Role

### New Developer Onboarding
1. **CONTRIBUTING.md** - Learn contribution guidelines
2. **01-product-PRD.md** - Understand product vision
3. **02-technical-architecture.md** - Understand system structure
4. **poc/README.md** - Learn about validated architecture decisions
5. **02-technical-spec.md** - Understand implementation details
6. **03-planning-development-plan.md** - Understand current phase
7. **03-planning-WBS.md** - Pick up tasks

### SRE/Operator Setup
1. **01-product-PRD.md** - Understand what CCOrch does
2. **02-technical-architecture.md** - Understand system components
3. **04-ops-hook-setup.md** - Deploy and configure
4. **04-ops-logging.md** - Understand log formats
5. **04-ops-runbook.md** - Handle day-to-day operations
6. **06-testing-smoke-tests.md** - Validate deployment

### API Consumer/Integrator
1. **01-product-PRD.md** - Understand workflow capabilities
2. **05-api-reference.md** - Learn API contracts
3. **04-ops-hook-setup.md** - Configure hook integration
4. **06-testing-e2e-results.md** - See real-world examples

### QA/Test Engineer
1. **01-product-PRD.md** - Understand features to test
2. **02-technical-spec.md** - Understand test requirements
3. **06-testing-harness.md** - Set up testing infrastructure
4. **06-testing-smoke-tests.md** - Run validation tests
5. **06-testing-e2e-results.md** - Review test coverage

---

## Document Interdependencies

```
01-product-PRD.md (Product Vision)
  ├── 02-technical-spec.md (Implementation)
  │   ├── 02-technical-architecture.md (Structure)
  │   ├── 02-technical-database.md (Data Model)
  │   └── 05-api-reference.md (API Contracts)
  │
  ├── 03-planning-development-plan.md (Timeline)
  │   └── 03-planning-WBS.md (Tasks)
  │
  └── deployment docs
      ├── 04-ops-hook-setup.md (Configuration)
      ├── 04-ops-logging.md (Observability)
      └── 04-ops-runbook.md (Operations)
          └── 06-testing-smoke-tests.md (Validation)

Testing docs (cross-cutting):
  ├── 06-testing-harness.md (Infrastructure)
  ├── 06-testing-e2e-results.md (Results)
  └── 06-testing-release-checklist.md (Quality Gates)
```

---

## Key Concepts by Document

### Workflow Chains (01-product-PRD.md, 02-technical-spec.md)
- backend-development, frontend-development, debug, review
- backend-design-only, frontend-design-only, backend-only, frontend-only
- review-only, debug-only

### Hook Types (04-ops-hook-setup.md, 05-api-reference.md, 06-testing-e2e-results.md)
- **UserPromptSubmit**: Intercepts user prompts (when `\cco` or `\c2o` trigger detected), injects agent instructions
- **PostToolUse**: Captures agent completion (filters by `tool_name === 'Task'`), extracts results from `tool_response.stdout`, advances workflow
- **Stop**: Cleans up workflows when session terminates (uses `session_id` to find active workflows)

### Complexity Levels (01-product-PRD.md, 02-technical-spec.md)
- **Simple**: Single file, quick fixes
- **Moderate**: Standard features (default)
- **Complex**: System-wide changes, architecture

### Agent Roles (01-product-PRD.md, 03-planning-WBS.md)
- backend-architect, frontend-architect
- java-backend-developer, nextjs-react-developer
- code-reviewer, issue-detective, e2e-test-architect

### Trigger Protocol (04-ops-hook-setup.md, 06-testing-e2e-results.md)
- `\cco` or `\c2o` prefix (case insensitive)
- Avoids conflicts with Claude Code slash commands
- **Session-Based Correlation**:
  - Workflows correlated to Claude Code sessions via `session_id`
  - Active workflow lookup by session prevents duplicate workflows
  - PostToolUse filters by session to ensure correct workflow advancement
  - Stop hook uses `session_id` to find and clean up active workflows

---

## Recent Changes

### 2025-10-08: Documentation Accuracy Update
- **Files Updated**: docs/00-README.md, CLAUDE.md, CONTRIBUTING.md, poc/README.md
- **Changes**:
  - Fixed agent role names to match implementation (java-backend-developer, nextjs-react-developer, code-reviewer, issue-detective)
  - Added PostToolUse filtering details (Task tool filtering, result extraction)
  - Expanded session correlation explanation
  - Added PoC documentation section
  - Added root-level documentation references (CLAUDE.md, CONTRIBUTING.md)
  - Updated poc/README.md to reflect production architecture (PostToolUse, opt-in triggers)
- **Impact**: Documentation now accurately reflects implemented architecture

### 2025-10-07: Session Tracking & Trigger Change
- **Files Updated**: 04-ops-hook-setup.md, 06-testing-e2e-results.md, 02-technical-spec.md
- **Changes**:
  - Added session tracking to workflows
  - Changed trigger from `/cco` to `\cco`
  - Implemented two-level filtering for PostToolUse hook
  - Updated Stop hook for session-specific cleanup
- **Impact**: All hook documentation reflects new session-based filtering

---

## Contributing to Documentation

When updating documentation:

1. **Keep README.md (this file) in sync** with any new documents
2. **Update file sizes** if documents grow significantly
3. **Cross-reference related documents** using relative links
4. **Follow existing structure**:
   - Start with overview/purpose
   - Provide clear sections
   - Include examples
   - End with troubleshooting or next steps
5. **Use consistent terminology** across all documents

---

## Documentation Maintenance

### Quarterly Review
- [ ] Verify all file sizes and update map
- [ ] Check for outdated information
- [ ] Update cross-references
- [ ] Add new documents to map

### After Major Changes
- [ ] Update relevant documents immediately
- [ ] Update this README.md with changes
- [ ] Verify dependencies still accurate
- [ ] Update reading order if needed

---

## Getting Help

- **Can't find what you need?** Start with 01-product-PRD.md for high-level overview
- **Need implementation details?** Check 02-technical-spec.md first
- **Operational issues?** Go to 04-ops-runbook.md
- **API questions?** Refer to 05-api-reference.md
- **Still stuck?** Check 02-technical-architecture.md for system understanding

---

**Last Updated**: 2025-10-08
**Total Documentation Size**: ~470 KB
**Document Count**: 17 files (14 in docs/, 1 in poc/, 2 root-level)
