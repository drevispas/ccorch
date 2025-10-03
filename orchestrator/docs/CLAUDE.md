# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Core System Architecture

This is a **production orchestration system** that coordinates multiple specialized AI agents through an HTTP server and hook integration. The system has two main operational layers:

### TypeScript Core Framework (`/core/`)
- **9 YAML workflow definitions** in `/workflows/` (full-feature, debug-issue, backend-only, etc.)
- **18 specialized agent definitions** in `/agents/` (6 agents × 3 complexity levels)
- **Core orchestration engine** with type-safe workflow execution and state management
- **Thinking levels system** for automatic complexity detection and agent selection

### Production Runtime (`/server/` and `/hooks/`)
- **HTTP server** on port 3001 (JavaScript compiled from TypeScript core)
- **Hook integration** with Claude Code via UserPromptSubmit hook
- **Asynchronous task discovery** where Claude Code finds tasks via HTTP API
- **File-based result storage** with automatic workflow progression

## Development Commands

### TypeScript Core Development
```bash
# Build and run production server
npm install && npm run build
npm run server  # HTTP server on port 3001

# Development workflow
npm run dev      # TypeScript watch mode
npm run test     # Run Jest test suite
npm run lint     # ESLint validation
npm run lint:fix # Auto-fix linting issues

# Specific testing
npm run test:jest       # Jest tests only
npm run test:watch      # Jest in watch mode
npm start               # Direct TypeScript orchestrator execution

# Utilities
npm run cleanup         # Clean up state and log files
npm run copy-schemas    # Copy JSON schemas to dist/
```

### Integration Testing
```bash
# Test hook integration (run from project root)
echo '{"prompt":"Run debug-issue workflow: test"}' | node hooks/orchestrator-hook.js

# Test server health
curl -s http://localhost:3001/api/health | jq

# Complete workflow simulation
curl -X POST http://localhost:3001/api/execute \
  -H "Content-Type: application/json" \
  -d '{"workflowType":"debug-issue","taskDescription":"test issue","projectDirectory":"/path/to/project"}'

# Check workflow status
curl -s http://localhost:3001/api/status/{workflowId} | jq

# Get next task (simulates Claude Code task discovery)
curl -s http://localhost:3001/api/next-task/{workflowId} | jq
```

## Hook Integration System

The orchestration system operates through **hook integration and API communication**:

1. **UserPromptSubmit Hook** (`hooks/orchestrator-hook.js`)
   - Detects workflow commands in user input
   - Communicates with HTTP server to initialize workflows
   - Injects orchestration context for Claude Code guidance

2. **Direct API Communication**
   - Claude Code discovers tasks via `GET /api/next-task/{workflowId}`
   - Results submitted directly via `POST /api/agent-result`
   - No PostToolUse hook required - asynchronous task execution model

## Agent Execution Flow

1. **Command Detection**: Hook detects `Run [type] workflow: [description]` patterns
2. **Server Initialization**: Hook calls `POST /api/init`, `POST /api/parse-command`, and `POST /api/execute`
3. **Complexity Detection**: Server analyzes task description to determine thinking level
4. **Task Creation**: Server creates first task in workflow sequence
5. **Task Discovery**: Claude Code discovers tasks via `GET /api/next-task/{workflowId}`
6. **Agent Execution**: Claude Code executes Task tool with provided agent parameters
7. **Result Submission**: Claude Code submits results via `POST /api/agent-result`
8. **Automatic Chaining**: Server processes result, saves to files, and creates next task
9. **Workflow Completion**: Process repeats until all agents in sequence complete

## Key Configuration Files

- **`core/config/constants.ts`**: All timeout and configuration constants
  - `ORCHESTRATOR_CONFIG.timeouts.claudeIntegration.agentExecutionTimeout`: Agent execution timeout (10 minutes)
  - `ORCHESTRATOR_PORT`: Server port configuration (default: 3001)

- **`core/types.ts`**: Core TypeScript interfaces for workflows, agents, and state management

- **`server/main.js`**: Production HTTP server managing workflow state and task coordination

- **`core/complexity-detector.ts`**: Automatic thinking level detection system

- **`core/orchestrator.ts`**: Main orchestration engine with full feature set

- **`core/simple-orchestrator.ts`**: Streamlined orchestration for simplified workflows

## Workflow Development

### Adding New Workflows
1. Create YAML file in `/workflows/` following existing patterns
2. Define agent sequence with `sequence:` array
3. Support parallel execution with `type: parallel` groups
4. Test with workflow commands like `Run [workflow-name] workflow: [description]`

### Adding New Agents
1. Create three markdown files in `/agents/` for complexity levels:
   - `[agent-name]-simple.md` (light thinking)
   - `[agent-name]-moderate.md` (standard thinking)
   - `[agent-name]-complex.md` (ultra thinking)
2. Reference agent name in workflow definitions
3. System will automatically select appropriate complexity level

### Server API Endpoints

Core endpoints for workflow coordination:
- `POST /api/init` - Initialize server
- `GET /api/health` - Server status
- `POST /api/parse-command` - Parse workflow commands
- `POST /api/execute` - Start workflow execution
- `GET /api/next-task/{workflowId}` - Get pending task for Claude
- `POST /api/agent-result` - Submit agent execution results
- `GET /api/status/{workflowId}` - Workflow status and progress
- `GET /api/workflows` - List active workflows
- `GET /api/todos/{workflowId}` - Get workflow todos
- `GET /api/debug/*` - Debug and recovery endpoints

## File Structure Patterns

```
orchestrator/
├── core/                     # TypeScript orchestration framework
│   ├── orchestrator.ts       # Main orchestration engine
│   ├── simple-orchestrator.ts # Streamlined orchestration
│   ├── complexity-detector.ts # Thinking level detection
│   ├── claude-integration.ts # Claude Code integration
│   ├── *-manager.ts          # State and file management
│   ├── config/               # Configuration constants
│   ├── monitoring/           # Logging and metrics
│   └── schemas/              # JSON schema definitions
├── dist/                     # Compiled JavaScript output
├── server/                   # HTTP server runtime
│   ├── main.js               # Production HTTP server
│   └── simplified.js         # Simplified server variant
├── hooks/                    # Claude Code integration hooks
│   ├── orchestrator-hook.js  # UserPromptSubmit hook
│   └── task-result-capture.js # Legacy result processing
├── workflows/                # YAML workflow definitions (9 files)
├── agents/                   # Agent definitions (18 files: 6×3 levels)
├── state/                    # Runtime workflow state
├── archive/                  # Completed workflow archives
├── logs/                     # Server and orchestration logs
├── docs/                     # Documentation
├── package.json              # NPM scripts and dependencies
└── README.md                 # User guide
```

## Agent State Management

The system maintains workflow state through:
- **HTTP Server State**: In-memory tracking of active workflows and pending tasks
- **TypeScript Core State**: File-based workflow state persistence in `/state/`
- **Result File Storage**: Structured JSON files for agent outputs and handover chains
- **Archive Management**: Completed workflows moved to `/archive/` for debugging
- **Multi-layer Logging**: Server logs, orchestration logs, and structured metrics
- **Timeout Management**: Configurable agent execution timeouts with recovery

## Thinking Levels System

The orchestrator automatically detects task complexity and selects appropriate agent definitions:
- **Light Think** (`*-simple.md`): Quick, direct solutions for prototypes and basic tasks
- **Standard Think** (`*-moderate.md`): Balanced approach with best practices
- **Ultra Think** (`*-complex.md`): Deep production analysis for enterprise systems

**Keywords trigger different levels:**
- Light: "simple", "basic", "quick", "prototype", "demo"
- Ultra: "production", "enterprise", "scalable", "secure", "high-availability"

When working with this system, always check server status first (`curl localhost:3001/api/health`) and ensure the HTTP server is running before testing workflow execution.