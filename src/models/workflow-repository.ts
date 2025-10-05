/**
 * WorkflowRepository
 *
 * Purpose: Implements IWorkflowRepository interface using Prisma ORM
 * Provides data access layer for Workflow entity with error handling
 */

import { PrismaClient, Workflow } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  IWorkflowRepository,
  WorkflowCreateInput,
  WorkflowFindByIdOptions,
  WorkflowStatus,
  WorkflowWithRelations,
  SetComplexityData,
} from '../types/repositories';

export class WorkflowRepository implements IWorkflowRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Create a new workflow with generated UUID and timestamps
   */
  async createWorkflow(data: WorkflowCreateInput): Promise<Workflow> {
    const now = BigInt(Date.now());
    const id = randomUUID();

    return this.prisma.workflow.create({
      data: {
        id,
        userPrompt: data.userPrompt,
        chainName: data.chainName,
        complexity: data.complexity,
        draftComplexity: data.draftComplexity,
        currentStep: data.currentStep ?? 0,
        status: data.status ?? 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  /**
   * Find workflow by ID with optional relations
   */
  async findById(
    id: string,
    options?: WorkflowFindByIdOptions
  ): Promise<WorkflowWithRelations | null> {
    const includeClause: any = {};

    if (options?.includeAgentResults) {
      includeClause.agentResults = true;
    }

    if (options?.includeTransitions) {
      includeClause.transitions = true;
    }

    const hasIncludes = Object.keys(includeClause).length > 0;

    return this.prisma.workflow.findUnique({
      where: { id },
      ...(hasIncludes && { include: includeClause }),
    }) as Promise<WorkflowWithRelations | null>;
  }

  /**
   * Find workflows by status
   */
  async findByStatus(status: WorkflowStatus): Promise<Workflow[]> {
    return this.prisma.workflow.findMany({
      where: { status },
    });
  }

  /**
   * Find all active workflows (convenience method)
   */
  async findActive(): Promise<Workflow[]> {
    return this.findByStatus('ACTIVE');
  }

  /**
   * Update workflow status and optionally current step
   */
  async updateStatus(
    id: string,
    status: WorkflowStatus,
    currentStep?: number
  ): Promise<Workflow> {
    const updateData: any = {
      status,
      updatedAt: BigInt(Date.now()),
    };

    if (currentStep !== undefined) {
      updateData.currentStep = currentStep;
    }

    return this.prisma.workflow.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Update workflow complexity and advance to ACTIVE status
   * Used when Claude Code determines final complexity
   */
  async updateComplexity(id: string, data: SetComplexityData): Promise<Workflow> {
    return this.prisma.workflow.update({
      where: { id },
      data: {
        complexity: data.complexity,
        status: 'ACTIVE',
        currentStep: 0,
        updatedAt: BigInt(Date.now()),
      },
    });
  }

  /**
   * Delete workflow (cascades to agent results and transitions)
   * Returns true if deleted, false if workflow doesn't exist
   */
  async deleteWorkflow(id: string): Promise<boolean> {
    try {
      await this.prisma.workflow.delete({
        where: { id },
      });
      return true;
    } catch (error) {
      // Prisma throws error if record doesn't exist
      return false;
    }
  }
}
