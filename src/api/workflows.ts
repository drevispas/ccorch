/**
 * Workflows API Router
 *
 * WBS Task: 7.1 API Route Structure
 * PRD Reference: §5.4 (API Interface)
 *
 * Provides monitoring and administrative endpoints for workflows.
 * Note: Agent results are submitted via PostToolUse hook payload, not API.
 */

import { Router, type Request, type Response } from 'express';
import type { Orchestrator } from '../services/orchestrator.js';
import type { IWorkflowRepository } from '../types/repositories.js';
import { StatusQuerySchema, TransitionRequestSchema } from './validation.js';
import { ChainName, type AgentRole } from '../types/workflow.js';
import { PrismaClient } from '@prisma/client';
import { requireApiKey } from '../middleware/api-key-auth.js';

/**
 * Chain sequences for calculating total_steps
 * Duplicated from state-manager.ts to avoid circular dependencies
 */
const CHAIN_SEQUENCES: Record<ChainName, AgentRole[]> = {
  [ChainName.BACKEND_DEVELOPMENT]: [
    'backend-architect' as AgentRole,
    'backend-developer' as AgentRole,
    'reviewer' as AgentRole,
  ],
  [ChainName.FRONTEND_DEVELOPMENT]: [
    'frontend-architect' as AgentRole,
    'frontend-developer' as AgentRole,
    'reviewer' as AgentRole,
  ],
  [ChainName.DEBUG]: [
    'debugger' as AgentRole,
    'backend-developer' as AgentRole,
    'reviewer' as AgentRole,
  ],
  [ChainName.REVIEW]: ['reviewer' as AgentRole, 'backend-developer' as AgentRole],
  [ChainName.BACKEND_DESIGN_ONLY]: ['backend-architect' as AgentRole],
  [ChainName.FRONTEND_DESIGN_ONLY]: ['frontend-architect' as AgentRole],
  [ChainName.BACKEND_ONLY]: ['backend-developer' as AgentRole],
  [ChainName.FRONTEND_ONLY]: ['frontend-developer' as AgentRole],
  [ChainName.REVIEW_ONLY]: ['reviewer' as AgentRole],
  [ChainName.DEBUG_ONLY]: ['debugger' as AgentRole],
};

/**
 * Generate summary text for workflow status
 */
function generateSummary(
  workflow: any,
  completedAgents: any[],
  totalSteps: number
): string {
  if (workflow.status === 'COMPLETED') {
    return `Workflow completed successfully with ${completedAgents.length} agents`;
  }
  if (workflow.status === 'FAILED') {
    const failedAgent = completedAgents.find((a) => a.status === 'FAILED');
    return failedAgent
      ? `Workflow failed at ${failedAgent.role}`
      : 'Workflow failed';
  }
  if (completedAgents.length === 0) {
    return `Workflow started, step ${workflow.currentStep}/${totalSteps}`;
  }
  const lastAgent = completedAgents[completedAgents.length - 1];
  return `${lastAgent.role} completed, step ${workflow.currentStep}/${totalSteps}`;
}

/**
 * Create workflows API router
 *
 * @param orchestrator - Orchestrator service instance
 * @param workflowRepo - Workflow repository instance
 * @returns Express router with workflow endpoints
 */
export function createWorkflowsRouter(
  orchestrator: Orchestrator,
  workflowRepo: IWorkflowRepository
): Router {
  const router = Router();
  const prisma = new PrismaClient();

  /**
   * GET /api/workflows/:id/status
   *
   * Query workflow progress and current state.
   * Public endpoint (no authentication required).
   *
   * Response format (PRD §5.4.3):
   * {
   *   workflow_id: string,
   *   status: 'ACTIVE' | 'COMPLETED' | 'FAILED',
   *   chain_name: string,
   *   complexity: 'simple' | 'moderate' | 'complex',
   *   current_step: number,
   *   total_steps: number,
   *   completed_agents: Array<{
   *     role: string,
   *     step: number,
   *     status: string,
   *     completed_at: number
   *   }>,
   *   summary: string
   * }
   */
  router.get('/:id/status', async (req: Request, res: Response) => {
    try {
      const workflowId = req.params.id;

      // Validate UUID format
      const validation = StatusQuerySchema.safeParse({ workflow_id: workflowId });
      if (!validation.success) {
        const errorMessage = validation.error.issues[0]?.message || 'Invalid UUID';
        return res.status(400).json({
          error: `Invalid workflow ID: ${errorMessage}`,
        });
      }

      // Query workflow
      const workflow = await workflowRepo.findById(workflowId);
      if (!workflow) {
        return res.status(404).json({
          error: 'Workflow not found',
          workflow_id: workflowId,
        });
      }

      // Query agent results
      const agentResults = await prisma.agentResult.findMany({
        where: { workflowId },
        orderBy: { stepNumber: 'asc' },
      });

      // Calculate total_steps from chain sequence
      const chainSequence = CHAIN_SEQUENCES[workflow.chainName as ChainName];
      const totalSteps = chainSequence ? chainSequence.length : 0;

      // Build completed_agents array
      const completedAgents = agentResults.map((result) => ({
        role: result.agentRole,
        step: result.stepNumber,
        status: result.status,
        completed_at: Number(result.createdAt),
      }));

      // Generate summary
      const summary = generateSummary(workflow, completedAgents, totalSteps);

      // Return response per PRD §5.4.3
      return res.status(200).json({
        workflow_id: workflow.id,
        status: workflow.status,
        chain_name: workflow.chainName,
        complexity: workflow.complexity,
        current_step: workflow.currentStep,
        total_steps: totalSteps,
        completed_agents: completedAgents,
        summary,
      });
    } catch (error) {
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/workflows/:id/transition
   *
   * Admin endpoint for manual workflow control (debugging, recovery, testing).
   * Requires API key authentication.
   *
   * Request body:
   * {
   *   action: 'advance' | 'fail' | 'retry' | 'skip',
   *   reason: string
   * }
   *
   * Actions (PRD §5.4.4):
   * - advance: Force next step (current_step++)
   * - fail: Abort workflow (status=FAILED, stop chain)
   * - retry: Re-run current agent (keep current_step, clear last result)
   * - skip: Jump to next without completing current (current_step++, mark SKIPPED)
   *
   * Response format:
   * {
   *   workflow_id: string,
   *   previous_step: number,
   *   current_step: number,
   *   next_agent: string | null,
   *   status: string,
   *   message: string
   * }
   */
  router.post('/:id/transition', requireApiKey, async (req: Request, res: Response) => {
    try {
      const workflowId = req.params.id;

      // Validate request body
      const validation = TransitionRequestSchema.safeParse(req.body);
      if (!validation.success) {
        const errorMessage = validation.error.issues[0]?.message || 'Invalid request';
        return res.status(400).json({
          error: errorMessage,
        });
      }

      const { action, reason } = validation.data;

      // Get workflow
      const workflow = await workflowRepo.findById(workflowId);
      if (!workflow) {
        return res.status(404).json({
          error: 'Workflow not found',
          workflow_id: workflowId,
        });
      }

      const previousStep = workflow.currentStep;
      let currentStep = previousStep;
      let status = workflow.status;
      let nextAgent: string | null = null;
      let message = '';

      // Get chain sequence for next agent calculation
      const chainSequence = CHAIN_SEQUENCES[workflow.chainName as ChainName];
      const totalSteps = chainSequence ? chainSequence.length : 0;

      // Execute action
      switch (action) {
        case 'advance': {
          // Increment step
          currentStep = previousStep + 1;

          // Check if workflow complete
          if (currentStep >= totalSteps) {
            status = 'COMPLETED';
            nextAgent = null;
            message = `Workflow advanced to step ${currentStep} and completed`;
          } else {
            // Get next agent
            const nextRole = chainSequence[currentStep];
            nextAgent = `${nextRole}-${workflow.complexity}`;
            message = `Workflow advanced to step ${currentStep}`;
          }

          // Update workflow
          await prisma.workflow.update({
            where: { id: workflowId },
            data: {
              currentStep,
              status,
              updatedAt: BigInt(Date.now()),
            },
          });

          // Record transition
          await prisma.workflowTransition.create({
            data: {
              workflowId,
              fromStep: previousStep,
              toStep: currentStep,
              fromAgent: previousStep < totalSteps ? chainSequence[previousStep] : null,
              toAgent: currentStep < totalSteps ? chainSequence[currentStep] : null,
              reason,
              createdAt: BigInt(Date.now()),
            },
          });
          break;
        }

        case 'fail': {
          // Mark workflow as failed
          status = 'FAILED';
          nextAgent = null;
          message = `Workflow failed at step ${currentStep}`;

          // Update workflow
          await prisma.workflow.update({
            where: { id: workflowId },
            data: {
              status: 'FAILED',
              updatedAt: BigInt(Date.now()),
            },
          });

          // Record transition
          await prisma.workflowTransition.create({
            data: {
              workflowId,
              fromStep: currentStep,
              toStep: currentStep,
              fromAgent: currentStep < totalSteps ? chainSequence[currentStep] : null,
              toAgent: null,
              reason,
              createdAt: BigInt(Date.now()),
            },
          });
          break;
        }

        case 'retry': {
          // Delete last agent result for current step
          await prisma.agentResult.deleteMany({
            where: {
              workflowId,
              stepNumber: currentStep,
            },
          });

          // Keep current step, get agent for retry
          if (currentStep < totalSteps) {
            const retryRole = chainSequence[currentStep];
            nextAgent = `${retryRole}-${workflow.complexity}`;
          }
          message = `Cleared results for step ${currentStep}, ready to retry`;

          // Record transition
          await prisma.workflowTransition.create({
            data: {
              workflowId,
              fromStep: currentStep,
              toStep: currentStep,
              fromAgent: currentStep < totalSteps ? chainSequence[currentStep] : null,
              toAgent: currentStep < totalSteps ? chainSequence[currentStep] : null,
              reason,
              createdAt: BigInt(Date.now()),
            },
          });
          break;
        }

        case 'skip': {
          // Create SKIPPED result for current step
          if (currentStep < totalSteps) {
            await prisma.agentResult.create({
              data: {
                workflowId,
                agentRole: chainSequence[currentStep],
                complexity: workflow.complexity,
                stepNumber: currentStep,
                results: JSON.stringify({ summary: 'Skipped by admin' }),
                status: 'SKIPPED',
                createdAt: BigInt(Date.now()),
              },
            });
          }

          // Increment step
          currentStep = previousStep + 1;

          // Check if workflow complete
          if (currentStep >= totalSteps) {
            status = 'COMPLETED';
            nextAgent = null;
            message = `Skipped step ${previousStep}, workflow completed`;
          } else {
            // Get next agent
            const nextRole = chainSequence[currentStep];
            nextAgent = `${nextRole}-${workflow.complexity}`;
            message = `Skipped step ${previousStep}, advanced to step ${currentStep}`;
          }

          // Update workflow
          await prisma.workflow.update({
            where: { id: workflowId },
            data: {
              currentStep,
              status,
              updatedAt: BigInt(Date.now()),
            },
          });

          // Record transition
          await prisma.workflowTransition.create({
            data: {
              workflowId,
              fromStep: previousStep,
              toStep: currentStep,
              fromAgent: previousStep < totalSteps ? chainSequence[previousStep] : null,
              toAgent: currentStep < totalSteps ? chainSequence[currentStep] : null,
              reason,
              createdAt: BigInt(Date.now()),
            },
          });
          break;
        }
      }

      // Return response per PRD §5.4.4
      return res.status(200).json({
        workflow_id: workflowId,
        previous_step: previousStep,
        current_step: currentStep,
        next_agent: nextAgent,
        status,
        message,
      });
    } catch (error) {
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
