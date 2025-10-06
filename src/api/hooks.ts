/**
 * Hook API Routes
 *
 * WBS Task: 6.2 HTTP Endpoint Integration
 * Implements HTTP endpoints for Claude Code hook events
 */

import { Router, type Request, type Response } from 'express';
import { handleUserPromptSubmit } from '../hooks/user-prompt-submit';
import { handlePostToolUse } from '../hooks/post-tool-use';
import { handleStop } from '../hooks/stop';
import type { Orchestrator } from '../services/orchestrator';
import type { IWorkflowRepository } from '../types/repositories';

/**
 * Create hook router with dependency injection
 */
export function createHookRouter(
  orchestrator: Orchestrator,
  workflowRepo: IWorkflowRepository
): Router {
  const router = Router();

  /**
   * POST /hooks/user-prompt-submit
   * Handles UserPromptSubmit hook events from Claude Code
   */
  router.post('/user-prompt-submit', async (req: Request, res: Response) => {
    try {
      const response = await handleUserPromptSubmit(req.body, orchestrator);
      res.status(200).json(response);
    } catch (error) {
      console.error('Error in user-prompt-submit endpoint:', error);
      res.status(500).json({
        message: 'Internal server error',
      });
    }
  });

  /**
   * POST /hooks/post-tool-use
   * Handles PostToolUse hook events from Claude Code
   * Extracts agent results from payload and orchestrates next step
   */
  router.post('/post-tool-use', async (req: Request, res: Response) => {
    try {
      const response = await handlePostToolUse(req.body, orchestrator);
      res.status(200).json(response);
    } catch (error) {
      console.error('Error in post-tool-use endpoint:', error);
      res.status(500).json({
        message: 'Internal server error',
      });
    }
  });

  /**
   * POST /hooks/stop
   * Handles Stop hook events from Claude Code
   * Cleans up orphaned workflows when sessions terminate
   */
  router.post('/stop', async (req: Request, res: Response) => {
    try {
      await handleStop(workflowRepo);
      // Stop hook doesn't return a message (PRD §5.1)
      res.status(200).send();
    } catch (error) {
      console.error('Error in stop endpoint:', error);
      res.status(500).send();
    }
  });

  return router;
}
