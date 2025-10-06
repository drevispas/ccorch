/**
 * Mock Claude Code Server
 *
 * Purpose: Simulates Claude Code sending hook payloads to CCOrch for testing
 * WBS Task: 6.6 Hook Test Harness
 *
 * This server runs on port 4000 and sends test hook payloads to CCOrch
 * running on port 3000. Useful for integration testing and development.
 */

import express, { Request, Response } from 'express';
import { randomUUID } from 'crypto';

const app = express();
const PORT = 4000;
const CCORCH_URL = process.env.CCORCH_URL || 'http://localhost:3000';
const HOOK_SECRET = process.env.HOOK_SECRET || 'test-hook-secret';

app.use(express.json());

/**
 * Generate sample UserPromptSubmit hook payload
 */
function generateUserPromptSubmitPayload(prompt: string) {
  return {
    session_id: randomUUID(),
    transcript_path: `/tmp/claude-code-session-${Date.now()}.json`,
    cwd: process.cwd(),
    hook_event_name: 'UserPromptSubmit',
    prompt,
  };
}

/**
 * Generate sample PostToolUse hook payload with agent results
 */
function generatePostToolUsePayload(
  workflowId: string,
  agentRole: string,
  complexity: string,
  stepNumber: number,
  results: Record<string, unknown>
) {
  return {
    session_id: randomUUID(),
    transcript_path: `/tmp/claude-code-session-${Date.now()}.json`,
    cwd: process.cwd(),
    hook_event_name: 'PostToolUse',
    tool_name: 'Task',
    workflow_id: workflowId,
    agent_role: agentRole,
    complexity,
    step_number: stepNumber,
    results,
  };
}

/**
 * Generate sample Stop hook payload
 */
function generateStopPayload() {
  return {
    session_id: randomUUID(),
    transcript_path: `/tmp/claude-code-session-${Date.now()}.json`,
    cwd: process.cwd(),
    hook_event_name: 'Stop',
  };
}

/**
 * Send hook payload to CCOrch
 */
async function sendHookToCCOrch(
  hookEndpoint: string,
  payload: unknown
): Promise<{ status: number; data: unknown }> {
  try {
    // eslint-disable-next-line no-undef
    const response = await fetch(`${CCORCH_URL}${hookEndpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hook-Secret': HOOK_SECRET,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    return { status: response.status, data };
  } catch (error) {
    console.error('Error sending hook to CCOrch:', error);
    throw error;
  }
}

/**
 * POST /trigger/user-prompt-submit
 * Trigger UserPromptSubmit hook with custom prompt
 */
app.post('/trigger/user-prompt-submit', async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      res.status(400).json({ error: 'Missing required field: prompt' });
      return;
    }

    const payload = generateUserPromptSubmitPayload(prompt);
    console.log('\n[Mock CC] Sending UserPromptSubmit hook...');
    console.log('Payload:', JSON.stringify(payload, null, 2));

    const result = await sendHookToCCOrch('/hooks/user-prompt-submit', payload);

    console.log('\n[Mock CC] Received response from CCOrch:');
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));

    res.status(200).json({
      success: true,
      hookSent: payload,
      ccorchResponse: result,
    });
  } catch (error) {
    console.error('[Mock CC] Error:', error);
    res.status(500).json({ error: 'Failed to send hook' });
  }
});

/**
 * POST /trigger/post-tool-use
 * Trigger PostToolUse hook with agent results
 */
app.post('/trigger/post-tool-use', async (req: Request, res: Response) => {
  try {
    const { workflowId, agentRole, complexity, stepNumber, results } = req.body;

    if (!workflowId || !agentRole || !complexity || stepNumber === undefined || !results) {
      res.status(400).json({
        error: 'Missing required fields: workflowId, agentRole, complexity, stepNumber, results',
      });
      return;
    }

    const payload = generatePostToolUsePayload(
      workflowId,
      agentRole,
      complexity,
      stepNumber,
      results
    );

    console.log('\n[Mock CC] Sending PostToolUse hook...');
    console.log('Payload:', JSON.stringify(payload, null, 2));

    const result = await sendHookToCCOrch('/hooks/post-tool-use', payload);

    console.log('\n[Mock CC] Received response from CCOrch:');
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));

    res.status(200).json({
      success: true,
      hookSent: payload,
      ccorchResponse: result,
    });
  } catch (error) {
    console.error('[Mock CC] Error:', error);
    res.status(500).json({ error: 'Failed to send hook' });
  }
});

/**
 * POST /trigger/stop
 * Trigger Stop hook
 */
app.post('/trigger/stop', async (req: Request, res: Response) => {
  try {
    const payload = generateStopPayload();

    console.log('\n[Mock CC] Sending Stop hook...');
    console.log('Payload:', JSON.stringify(payload, null, 2));

    const result = await sendHookToCCOrch('/hooks/stop', payload);

    console.log('\n[Mock CC] Received response from CCOrch:');
    console.log('Status:', result.status);

    res.status(200).json({
      success: true,
      hookSent: payload,
      ccorchResponse: result,
    });
  } catch (error) {
    console.error('[Mock CC] Error:', error);
    res.status(500).json({ error: 'Failed to send hook' });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'Mock Claude Code Server',
    port: PORT,
    ccorchUrl: CCORCH_URL,
  });
});

/**
 * Start server
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => {
    console.log(`\n🎭 Mock Claude Code Server running on port ${PORT}`);
    console.log(`📡 Targeting CCOrch at: ${CCORCH_URL}`);
    console.log(`🔑 Using hook secret: ${HOOK_SECRET}\n`);
    console.log('Available endpoints:');
    console.log('  POST /trigger/user-prompt-submit - Send UserPromptSubmit hook');
    console.log('  POST /trigger/post-tool-use - Send PostToolUse hook');
    console.log('  POST /trigger/stop - Send Stop hook');
    console.log('  GET  /health - Health check\n');
  });
}

export { app, generateUserPromptSubmitPayload, generatePostToolUsePayload, generateStopPayload };
