# CCOrch - Claude Code Orchestrator

Trigger multi-agent workflows by prefixing your prompt with `\cco` or `\c2o`.

## Usage

```
\cco <your development task>
```

## Examples

- `\cco Design a REST API for user management`
- `\cco Implement authentication with JWT tokens`
- `\cco Fix the bug in the login endpoint`
- `\cco Review the changes in src/api/`
- `\c2o Refactor the database layer for better performance`

## Available Workflows

### Full Development Chains
- **backend-development**: backend-architect → backend-developer → reviewer
- **frontend-development**: frontend-architect → frontend-developer → reviewer
- **debug**: debugger → developer → reviewer
- **review**: reviewer → developer (for code review and improvements)

### Partial Chains
- **backend-design-only**: backend-architect (architecture design without implementation)
- **frontend-design-only**: frontend-architect (UI/UX design without implementation)
- **backend-only**: backend-developer (implementation without architecture phase)
- **frontend-only**: frontend-developer (implementation without design phase)
- **review-only**: reviewer (code review only)
- **debug-only**: debugger (investigation only)

## Complexity Levels

CCOrch automatically determines complexity based on keywords:

### Simple (single file, quick fixes)
Keywords: `fix`, `add`, `rename`, `single`, `quick`, `update`

### Complex (system-wide, architecture changes)
Keywords: `design`, `architect`, `refactor`, `migrate`, `enterprise`, `system-wide`, `whole`, `complete`

### Moderate (default)
Everything else - standard feature implementation

## How It Works

1. **You type**: `\cco Design a REST API`
2. **CCOrch analyzes**: Intent → complexity → workflow chain
3. **Agent injection**: CCOrch injects appropriate subagent prompt
4. **Automatic execution**: Claude Code automatically invokes the Task tool
5. **Chain progression**: Subsequent agents triggered via PostToolUse hook
6. **Completion**: Final agent provides consolidated results

## Configuration

CCOrch is configured via `.claude/settings.json` hooks:
- `UserPromptSubmit`: Triggers workflow creation and first agent
- `PostToolUse`: Advances workflow to next agent
- `Stop`: Cleanup for workflow termination

## Examples by Workflow Type

### Backend Development
```
\cco Implement user authentication API with JWT tokens
```
→ Triggers: backend-architect-moderate → backend-developer-moderate → reviewer-moderate

### Frontend Development
```
\cco Create a dashboard component with charts and filters
```
→ Triggers: frontend-architect-moderate → frontend-developer-moderate → reviewer-moderate

### Debug Workflow
```
\cco Fix the memory leak in the data processing service
```
→ Triggers: debugger-moderate → backend-developer-moderate → reviewer-moderate

### Design Only
```
\cco Design the architecture for a multi-tenant system
```
→ Triggers: backend-architect-complex (single agent, no implementation)

### Review Only
```
\cco Review the changes in src/api/workflows.ts
```
→ Triggers: reviewer-moderate (single agent, review only)

## Tips

- **Be specific**: Instead of "Fix bug", say "Fix authentication bug in login endpoint"
- **Use keywords**: Include context like "backend", "frontend", "API", "UI" to help chain resolution
- **Complexity hints**: Use "simple", "complex", or "enterprise" to influence complexity detection
- **Normal conversation**: Omit `\cco` prefix for regular Claude responses (no orchestration)

## Troubleshooting

### Orchestration not triggering?
- Check that you're using `\cco` or `\c2o` prefix (case insensitive)
- Ensure there's a space after the trigger: `\cco Design...` not `\ccoDesign...`
- Verify CCOrch server is running on port 3000

### Wrong workflow selected?
- Add explicit keywords: "backend API" or "frontend component"
- Use complexity keywords: "simple fix" or "complex architecture"
- Check logs in `/tmp/ccorch-server.log` for chain resolution details

### Normal conversation triggering orchestration?
- This shouldn't happen with trigger detection enabled
- If it does, file a bug report with example prompt

## Documentation

- **PRD**: `docs/PRD.md` - Product requirements and workflow chains
- **Technical Spec**: `docs/technical-spec.md` - Implementation details
- **Architecture**: `docs/architecture.md` - System design diagrams
- **WBS**: `docs/WBS.md` - Detailed task breakdown

## Server Status

Check CCOrch health:
```bash
curl http://localhost:3000/health
```

View logs:
```bash
tail -f /tmp/ccorch-server.log
```

Query workflow status:
```bash
curl http://localhost:3000/api/workflows/{workflow-id}/status
```
