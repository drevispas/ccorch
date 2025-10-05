/**
 * Complexity API Route
 *
 * Purpose: Handle Claude Code's complexity determination callback
 * Endpoint: POST /api/workflows/:workflowId/set-complexity
 *
 * Flow:
 * 1. UserPromptSubmit hook asks CC to analyze complexity
 * 2. CC analyzes task and calls this endpoint with determination
 * 3. Endpoint updates workflow, generates first agent prompt
 * 4. Returns nextInstructions for CC to execute
 */

import { Request, Response } from 'express';
import {
  SetComplexityRequestSchema,
  WorkflowIdParamSchema,
} from '../validators/complexity.validator.js';
import { WorkflowRepository } from '../../models/workflow-repository.js';
import { TransitionRepository } from '../../models/transition-repository.js';
import { generateAgentPrompt } from '../../services/prompt-generator.js';
import { getPrismaClient } from '../../config/database.js';

// TODO: Import chain resolver to get agent sequence for chain
// For now, using a simple mock chain definition
interface ChainConfig {
  chainName: string;
  agents: Array<{ role: string; stepNumber: number }>;
}

/**
 * Mock chain definitions (TODO: Import from chain-resolver service when implemented)
 */
const CHAIN_DEFINITIONS: Record<string, ChainConfig> = {
  'backend-development': {
    chainName: 'backend-development',
    agents: [
      { role: 'backend-architect', stepNumber: 0 },
      { role: 'backend-developer', stepNumber: 1 },
      { role: 'reviewer', stepNumber: 2 },
    ],
  },
  'frontend-development': {
    chainName: 'frontend-development',
    agents: [
      { role: 'frontend-architect', stepNumber: 0 },
      { role: 'frontend-developer', stepNumber: 1 },
      { role: 'reviewer', stepNumber: 2 },
    ],
  },
  // Add other chains as needed
};

/**
 * POST /api/workflows/:workflowId/set-complexity
 *
 * Receives complexity determination from Claude Code, updates workflow,
 * and returns next agent injection instructions
 */
export async function setComplexity(req: Request, res: Response): Promise<void> {
  try {
    // Validate URL parameters
    const paramResult = WorkflowIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_PARAMS',
          message: 'Invalid workflow ID',
          details: paramResult.error.issues,
        },
      });
      return;
    }

    const { workflowId } = paramResult.data;

    // Validate request body
    const bodyResult = SetComplexityRequestSchema.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: bodyResult.error.issues,
        },
      });
      return;
    }

    const { complexity, reasoning } = bodyResult.data;

    // Get Prisma client and initialize repositories
    const prisma = getPrismaClient();
    const workflowRepo = new WorkflowRepository(prisma);
    const workflow = await workflowRepo.findById(workflowId);

    if (!workflow) {
      res.status(404).json({
        error: {
          code: 'WORKFLOW_NOT_FOUND',
          message: `Workflow ${workflowId} does not exist`,
        },
      });
      return;
    }

    // Validate workflow state (must be PENDING_COMPLEXITY)
    if (workflow.status !== 'PENDING_COMPLEXITY') {
      res.status(409).json({
        error: {
          code: 'INVALID_STATE',
          message: `Workflow status is ${workflow.status}, expected PENDING_COMPLEXITY`,
        },
      });
      return;
    }

    // Update workflow complexity and status
    const updatedWorkflow = await workflowRepo.updateComplexity(workflowId, {
      complexity,
      reasoning,
    });

    // Log transition
    const transitionRepo = new TransitionRepository(prisma);
    await transitionRepo.createTransition({
      workflowId,
      fromStep: -1,
      toStep: 0,
      fromAgent: null,
      toAgent: null, // Will be set to first agent role in chain
      reason: reasoning || `Complexity determined: ${complexity}`,
    });

    // Get chain configuration
    const chainConfig = CHAIN_DEFINITIONS[workflow.chainName];
    if (!chainConfig) {
      res.status(500).json({
        error: {
          code: 'INVALID_CHAIN',
          message: `Unknown chain: ${workflow.chainName}`,
        },
      });
      return;
    }

    // Get first agent in chain
    const firstAgent = chainConfig.agents[0];
    if (!firstAgent) {
      res.status(500).json({
        error: {
          code: 'EMPTY_CHAIN',
          message: `Chain ${workflow.chainName} has no agents`,
        },
      });
      return;
    }

    // Generate agent prompt using prompt-generator service
    const nextInstructions = generateAgentPrompt(
      {
        chainName: workflow.chainName,
        agentRole: firstAgent.role,
        complexity: complexity,
        stepNumber: firstAgent.stepNumber,
      },
      undefined, // No context for first agent
      workflowId,
    );

    // Return success response with next instructions
    res.status(200).json({
      success: true,
      workflowId,
      complexity,
      nextInstructions,
    });
  } catch (error) {
    console.error('Error in setComplexity:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
}
