/**
 * AgentResultRepository
 *
 * Purpose: Implements IAgentResultRepository interface using Prisma ORM
 * Provides data access layer for AgentResult entity with idempotency enforcement
 *
 * Key Feature: Unique constraint on (workflowId, stepNumber) prevents duplicate
 * result submissions from retried hooks
 */

import { PrismaClient, AgentResult } from '@prisma/client';
import {
  IAgentResultRepository,
  AgentResultCreateInput,
} from '../types/repositories';

export class AgentResultRepository implements IAgentResultRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Create agent result with timestamp
   * Throws error if (workflowId, stepNumber) already exists (idempotency enforcement)
   */
  async createResult(data: AgentResultCreateInput): Promise<AgentResult> {
    const now = BigInt(Date.now());

    try {
      return await this.prisma.agentResult.create({
        data: {
          workflowId: data.workflowId,
          agentRole: data.agentRole,
          complexity: data.complexity,
          stepNumber: data.stepNumber,
          results: data.results,
          status: data.status ?? 'COMPLETED',
          createdAt: now,
        },
      });
    } catch (error: unknown) {
      // Prisma unique constraint violation error code
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throw new Error(
          'Unique constraint failed on the fields: (`workflow_id`,`step_number`)'
        );
      }
      throw error;
    }
  }

  /**
   * Find all agent results for a workflow, ordered by step number
   */
  async findByWorkflowId(workflowId: string): Promise<AgentResult[]> {
    return this.prisma.agentResult.findMany({
      where: { workflowId },
      orderBy: { stepNumber: 'asc' },
    });
  }

  /**
   * Find agent result by workflow ID and step number
   */
  async findByWorkflowIdAndStep(
    workflowId: string,
    stepNumber: number
  ): Promise<AgentResult | null> {
    return this.prisma.agentResult.findFirst({
      where: {
        workflowId,
        stepNumber,
      },
    });
  }
}
