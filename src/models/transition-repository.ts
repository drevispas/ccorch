/**
 * TransitionRepository
 *
 * Purpose: Implements ITransitionRepository interface using Prisma ORM
 * Provides data access layer for WorkflowTransition entity (audit log)
 *
 * Key Feature: Records all workflow state changes with timestamps and reasons
 * for debugging, compliance, and accountability
 */

import { PrismaClient, WorkflowTransition } from '@prisma/client';
import {
  ITransitionRepository,
  WorkflowTransitionCreateInput,
} from '../types/repositories';

export class TransitionRepository implements ITransitionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Create transition record with timestamp
   */
  async createTransition(
    data: WorkflowTransitionCreateInput
  ): Promise<WorkflowTransition> {
    const now = BigInt(Date.now());

    return this.prisma.workflowTransition.create({
      data: {
        workflowId: data.workflowId,
        fromStep: data.fromStep,
        toStep: data.toStep,
        fromAgent: data.fromAgent ?? null,
        toAgent: data.toAgent ?? null,
        reason: data.reason ?? 'Agent completed successfully',
        createdAt: now,
      },
    });
  }

  /**
   * Find all transitions for a workflow, ordered chronologically (by createdAt)
   */
  async findByWorkflowId(workflowId: string): Promise<WorkflowTransition[]> {
    return this.prisma.workflowTransition.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Find latest transition for a workflow
   */
  async findLatest(workflowId: string): Promise<WorkflowTransition | null> {
    return this.prisma.workflowTransition.findFirst({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
