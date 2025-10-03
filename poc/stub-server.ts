/**
 * Claude Code Orchestrator - PoC Stub Server (TypeScript)
 *
 * Purpose: Validate Claude Code hooks can interact with CCOrch HTTP endpoints
 * before full system build-out.
 *
 * This minimal Express server provides:
 * - Hook endpoints (called by Claude Code via .claude/settings.json)
 * - Agent API endpoints (called by agents to submit results)
 * - In-memory state storage (no database)
 */

import express, { Request, Response, NextFunction } from 'express';

const app = express();
const PORT = 3000;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface WorkflowState {
  id: string;
  userPrompt: string;
  chainName: string;
  complexity: string;
  currentStep: number;
  status: 'ACTIVE' | 'COMPLETED' | 'FAILED';
  createdAt: number;
  updatedAt?: number;
  failureReason?: string;
  agentResults: AgentResult[];
}

interface AgentResult {
  agentRole: string;
  complexity: string;
  stepNumber: number;
  results: {
    summary: string;
    design?: string;
    files_modified?: string[];
    recommendations?: string;
  };
  status: string;
  createdAt: number;
}

interface UserPromptSubmitResponse {
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit';
    additionalContext: string;
  };
  decision?: 'block';
  reason?: string;
  continue?: boolean;
  stopReason?: string;
}

interface SubagentStopResponse {
  hookSpecificOutput: {
    hookEventName: 'SubagentStop';
    additionalContext: string;
  };
  decision?: 'block';
  reason?: string;
  continue?: boolean;
  stopReason?: string;
}

interface StopResponse {
  continue?: boolean;
  decision?: 'block';
  reason?: string;
  stopReason?: string;
}

interface PostToolUseResponse {
  hookSpecificOutput?: {
    hookEventName: 'PostToolUse';
    additionalContext: string;
  };
  decision?: 'block';
  reason?: string;
}

interface ApiResponse {
  success: boolean;
  workflow_id: string;
  message: string;
}

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

const workflows = new Map<string, WorkflowState>();

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(express.json());

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('  Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// ============================================================================
// HOOK ENDPOINTS (called by Claude Code)
// ============================================================================

/**
 * POST /hooks/user-prompt-submit
 *
 * Receives UserPromptSubmit hook from Claude Code.
 * Returns agent injection message that Claude Code will display to user.
 *
 * WBS Requirement: Returns JSON with `message` field containing mock agent injection
 */
app.post('/hooks/user-prompt-submit', (req: Request, res: Response) => {
  console.log('\n=== UserPromptSubmit Hook Received ===');
  console.log('Payload:', JSON.stringify(req.body, null, 2));

  // Generate mock workflow ID
  const workflowId = `wf-poc-${Date.now()}`;

  // Store workflow in memory
  const workflow: WorkflowState = {
    id: workflowId,
    userPrompt: req.body.prompt || 'Unknown prompt',
    chainName: 'backend-development',
    complexity: 'moderate',
    currentStep: 0,
    status: 'ACTIVE',
    createdAt: Date.now(),
    agentResults: []
  };

  workflows.set(workflowId, workflow);

  console.log(`Created workflow: ${workflowId}`);

  // Return agent injection response per Claude Code hook spec
  const response: UserPromptSubmitResponse = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: `Use the architect-moderate subagent to:
1. Design system architecture for the requested feature (design only, no implementation)
2. Define key components, APIs, and data models
3. Send results to CCOrch API: POST http://localhost:3000/api/workflows/${workflowId}/results

Workflow ID: ${workflowId}
Chain: backend-development-moderate (architect → backend-developer → reviewer)`
    }
  };

  console.log('Response:', JSON.stringify(response, null, 2));
  res.json(response);
});

/**
 * POST /hooks/subagent-stop
 *
 * Receives SubagentStop hook from Claude Code after agent completes.
 *
 * NOTE: Agent chaining is now handled by PostToolUse hook to avoid race conditions.
 * This endpoint is kept for logging/monitoring purposes only.
 */
app.post('/hooks/subagent-stop', (req: Request, res: Response) => {
  console.log('\n=== SubagentStop Hook Received ===');
  console.log('Note: Agent chaining handled by PostToolUse hook');
  console.log('Payload:', JSON.stringify(req.body, null, 2));

  // No action taken - PostToolUse hook handles all agent chaining logic
  res.json({});
});

/**
 * POST /hooks/stop
 *
 * Receives Stop hook from Claude Code on session termination.
 * Cleanup orphaned workflows.
 *
 * WBS Requirement: Returns 200 OK (no message injection)
 */
app.post('/hooks/stop', (req: Request, res: Response) => {
  console.log('\n=== Stop Hook Received ===');
  console.log('Payload:', JSON.stringify(req.body, null, 2));

  // Cleanup: Mark all active workflows as FAILED
  let cleanedCount = 0;
  for (const [id, workflow] of workflows.entries()) {
    if (workflow.status === 'ACTIVE') {
      workflow.status = 'FAILED';
      workflow.failureReason = 'Session terminated unexpectedly';
      cleanedCount++;
      console.log(`Marked workflow ${id} as FAILED`);
    }
  }

  console.log(`Cleaned up ${cleanedCount} orphaned workflow(s)`);

  // No message injection for Stop hook (per PRD)
  const response: StopResponse = {
    continue: true
  };

  res.json(response);
});

/**
 * POST /hooks/post-tool-use
 *
 * Receives PostToolUse hook from Claude Code after any tool completes.
 * If tool is "Task" (subagent), determines next agent in chain and injects context.
 *
 * PoC Test: Validate Option 2 - PostToolUse hook for agent chaining
 */
app.post('/hooks/post-tool-use', (req: Request, res: Response) => {
  console.log('\n=== PostToolUse Hook Received ===');
  console.log('Payload:', JSON.stringify(req.body, null, 2));

  const { tool_name, tool_input, tool_response } = req.body;

  // Only process Task tool (subagent completions)
  if (tool_name !== 'Task') {
    console.log(`Ignoring non-Task tool: ${tool_name}`);
    return res.json({});
  }

  console.log('Task tool detected - Processing subagent completion');

  // Extract workflow ID from tool_input prompt
  const workflowIdMatch = tool_input?.prompt?.match(/Workflow ID: (wf-poc-\d+)/);
  const workflowId = workflowIdMatch ? workflowIdMatch[1] : Array.from(workflows.keys())[0];

  const workflow = workflows.get(workflowId);

  if (!workflow) {
    console.log(`ERROR: Workflow ${workflowId} not found`);
    return res.json({});
  }

  console.log(`Workflow ${workflowId} - Current step: ${workflow.currentStep}`);

  // Agent sequence for backend-development chain
  const agentSequence = ['architect', 'backend-developer', 'reviewer'];
  const currentStep = workflow.currentStep;

  // Check if chain is complete
  if (currentStep >= agentSequence.length - 1) {
    console.log('Chain complete - No further agents to inject');
    workflow.status = 'COMPLETED';
    return res.json({});
  }

  // Advance to next agent
  workflow.currentStep++;
  const nextAgent = agentSequence[workflow.currentStep];
  const previousAgent = agentSequence[currentStep];

  console.log(`Injecting next agent: ${previousAgent} → ${nextAgent}`);

  // Get previous agent results summary
  const previousResults = workflow.agentResults[currentStep] || {
    summary: 'Architecture design completed'
  };

  // Construct next agent prompt based on role
  let nextAgentTask = '';
  if (nextAgent === 'backend-developer') {
    nextAgentTask = 'Implement the backend endpoints, services, and database models based on the architecture design';
  } else if (nextAgent === 'reviewer') {
    nextAgentTask = 'Review the code changes (both staged and unstaged) for quality, security, and best practices';
  }

  const response: PostToolUseResponse = {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `The ${previousAgent} agent has completed successfully.

Previous step summary: "${previousResults.summary}"

Next: Use the ${nextAgent}-moderate subagent to:
1. ${nextAgentTask}
2. Build on the previous agent's work
3. Send results to CCOrch API: POST http://localhost:3000/api/workflows/${workflowId}/results

Workflow ID: ${workflowId}
Chain: backend-development-moderate
Progress: Step ${workflow.currentStep + 1} of ${agentSequence.length} (${nextAgent})`
    }
  };

  console.log('Response:', JSON.stringify(response, null, 2));
  res.json(response);
});

// ============================================================================
// AGENT API ENDPOINTS (called by agents during execution)
// ============================================================================

/**
 * POST /api/workflows/:id/results
 *
 * Agents submit their execution results.
 *
 * WBS Requirement: Returns 200 OK, stores in-memory
 */
app.post('/api/workflows/:id/results', (req: Request, res: Response) => {
  const workflowId = req.params.id;
  console.log(`\n=== Agent Result Submission: ${workflowId} ===`);
  console.log('Payload:', JSON.stringify(req.body, null, 2));

  const workflow = workflows.get(workflowId);

  if (!workflow) {
    console.log(`ERROR: Workflow ${workflowId} not found`);
    return res.status(404).json({
      error: {
        code: 'WORKFLOW_NOT_FOUND',
        message: `Workflow ${workflowId} does not exist`
      }
    });
  }

  // Store agent results
  const agentResult: AgentResult = {
    agentRole: req.body.agent_role,
    complexity: req.body.complexity,
    stepNumber: workflow.currentStep,
    results: req.body.results,
    status: req.body.status || 'COMPLETED',
    createdAt: Date.now()
  };

  workflow.agentResults.push(agentResult);
  workflow.updatedAt = Date.now();

  console.log(`Stored result for step ${agentResult.stepNumber} (${agentResult.agentRole})`);

  const response: ApiResponse = {
    success: true,
    workflow_id: workflowId,
    message: 'Results received successfully'
  };

  console.log('Response:', JSON.stringify(response, null, 2));
  res.json(response);
});

/**
 * GET /api/workflows/:id/status
 *
 * Query workflow status and progress.
 *
 * WBS Requirement: Returns mock status (optional for PoC)
 */
app.get('/api/workflows/:id/status', (req: Request, res: Response) => {
  const workflowId = req.params.id;
  console.log(`\n=== Status Query: ${workflowId} ===`);

  const workflow = workflows.get(workflowId);

  if (!workflow) {
    console.log(`ERROR: Workflow ${workflowId} not found`);
    return res.status(404).json({
      error: {
        code: 'WORKFLOW_NOT_FOUND',
        message: `Workflow ${workflowId} does not exist`
      }
    });
  }

  const agentSequence = ['architect', 'backend-developer', 'reviewer'];
  const response = {
    workflow_id: workflowId,
    status: workflow.status,
    chain_name: workflow.chainName,
    complexity: workflow.complexity,
    current_step: workflow.currentStep,
    total_steps: agentSequence.length,
    completed_agents: workflow.agentResults.map((result, index) => ({
      role: result.agentRole,
      step: index,
      status: result.status,
      completed_at: result.createdAt
    })),
    summary: `Workflow ${workflow.status.toLowerCase()}. Step ${workflow.currentStep + 1} of ${agentSequence.length}.`
  };

  console.log('Response:', JSON.stringify(response, null, 2));
  res.json(response);
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

app.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Claude Code Orchestrator - PoC Stub Server (TypeScript)       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('\nAvailable endpoints:');
  console.log('  Hook Endpoints (Claude Code):');
  console.log(`    POST http://localhost:${PORT}/hooks/user-prompt-submit`);
  console.log(`    POST http://localhost:${PORT}/hooks/subagent-stop`);
  console.log(`    POST http://localhost:${PORT}/hooks/stop`);
  console.log(`    POST http://localhost:${PORT}/hooks/post-tool-use`);
  console.log('\n  Agent API Endpoints:');
  console.log(`    POST http://localhost:${PORT}/api/workflows/:id/results`);
  console.log(`    GET  http://localhost:${PORT}/api/workflows/:id/status`);
  console.log('\n  In-memory storage initialized (Map-based)');
  console.log('  TypeScript with tsx runtime');
  console.log('  Ready to receive requests!\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down stub server...');
  console.log(`Total workflows created: ${workflows.size}`);
  process.exit(0);
});
