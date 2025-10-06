/**
 * GET /api/workflows/:id/status Integration Tests
 *
 * WBS Task: 7.3 GET /api/workflows/:id/status (TDD)
 * PRD Reference: §5.4.3
 *
 * Tests the workflow status endpoint that provides monitoring capabilities.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { startServer } from '../../../src/server.js';
import type { Express } from 'express';
import { ChainName, Complexity, AgentRole, WorkflowStatus } from '../../../src/types/workflow.js';
import { WorkflowRepository } from '../../../src/models/workflow-repository.js';

describe('GET /api/workflows/:id/status', () => {
  let app: Express;
  let prisma: PrismaClient;
  let workflowRepo: WorkflowRepository;

  beforeEach(async () => {
    prisma = new PrismaClient();
    workflowRepo = new WorkflowRepository(prisma);

    // Clean database before each test
    await prisma.agentResult.deleteMany();
    await prisma.workflowTransition.deleteMany();
    await prisma.workflow.deleteMany();

    app = await startServer();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  it('should return 404 when workflow not found', async () => {
    const response = await request(app)
      .get('/api/workflows/00000000-0000-0000-0000-000000000000/status')
      .expect(404);

    expect(response.body).toEqual({
      error: 'Workflow not found',
      workflow_id: '00000000-0000-0000-0000-000000000000',
    });
  });

  it('should return 400 for invalid UUID format', async () => {
    const response = await request(app)
      .get('/api/workflows/invalid-uuid/status')
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('Invalid workflow ID');
  });

  it('should return status for ACTIVE workflow with completed agents', async () => {
    // Create workflow
    const workflow = await workflowRepo.createWorkflow({
      userPrompt: 'Implement backend auth API',
      chainName: ChainName.BACKEND_DEVELOPMENT,
      complexity: Complexity.MODERATE,
      currentStep: 1,
      status: WorkflowStatus.ACTIVE,
    });

    // Create agent result for step 0
    await prisma.agentResult.create({
      data: {
        workflowId: workflow.id,
        agentRole: AgentRole.BACKEND_ARCHITECT,
        complexity: Complexity.MODERATE,
        stepNumber: 0,
        results: JSON.stringify({ summary: 'Architecture designed' }),
        status: 'COMPLETED',
        createdAt: BigInt(Date.now()),
      },
    });

    const response = await request(app)
      .get(`/api/workflows/${workflow.id}/status`)
      .expect(200);

    expect(response.body).toMatchObject({
      workflow_id: workflow.id,
      status: 'ACTIVE',
      chain_name: 'backend-development',
      complexity: 'moderate',
      current_step: 1,
      total_steps: 3, // backend-development has 3 agents
    });

    expect(response.body.completed_agents).toHaveLength(1);
    expect(response.body.completed_agents[0]).toMatchObject({
      role: 'backend-architect',
      step: 0,
      status: 'COMPLETED',
    });
    expect(response.body.completed_agents[0]).toHaveProperty('completed_at');
    expect(response.body).toHaveProperty('summary');
  });

  it('should return status for COMPLETED workflow with all agents', async () => {
    // Create completed workflow
    const workflow = await workflowRepo.createWorkflow({
      userPrompt: 'Implement frontend component',
      chainName: ChainName.FRONTEND_DEVELOPMENT,
      complexity: Complexity.SIMPLE,
      currentStep: 3,
      status: WorkflowStatus.COMPLETED,
    });

    // Create agent results for all steps
    const now = BigInt(Date.now());
    await prisma.agentResult.createMany({
      data: [
        {
          workflowId: workflow.id,
          agentRole: AgentRole.FRONTEND_ARCHITECT,
          complexity: Complexity.SIMPLE,
          stepNumber: 0,
          results: JSON.stringify({ summary: 'Component design complete' }),
          status: 'COMPLETED',
          createdAt: now,
        },
        {
          workflowId: workflow.id,
          agentRole: AgentRole.FRONTEND_DEVELOPER,
          complexity: Complexity.SIMPLE,
          stepNumber: 1,
          results: JSON.stringify({ summary: 'Component implemented' }),
          status: 'COMPLETED',
          createdAt: now + BigInt(1000),
        },
        {
          workflowId: workflow.id,
          agentRole: AgentRole.REVIEWER,
          complexity: Complexity.SIMPLE,
          stepNumber: 2,
          results: JSON.stringify({ summary: 'Code reviewed and approved' }),
          status: 'COMPLETED',
          createdAt: now + BigInt(2000),
        },
      ],
    });

    const response = await request(app)
      .get(`/api/workflows/${workflow.id}/status`)
      .expect(200);

    expect(response.body).toMatchObject({
      workflow_id: workflow.id,
      status: 'COMPLETED',
      chain_name: 'frontend-development',
      complexity: 'simple',
      current_step: 3,
      total_steps: 3,
    });

    expect(response.body.completed_agents).toHaveLength(3);
    expect(response.body.completed_agents[0].role).toBe('frontend-architect');
    expect(response.body.completed_agents[1].role).toBe('frontend-developer');
    expect(response.body.completed_agents[2].role).toBe('reviewer');
  });

  it('should return status for FAILED workflow', async () => {
    // Create failed workflow
    const workflow = await workflowRepo.createWorkflow({
      userPrompt: 'Debug production issue',
      chainName: ChainName.DEBUG_ONLY,
      complexity: Complexity.COMPLEX,
      currentStep: 0,
      status: WorkflowStatus.FAILED,
    });

    // Create failed agent result
    await prisma.agentResult.create({
      data: {
        workflowId: workflow.id,
        agentRole: AgentRole.DEBUGGER,
        complexity: Complexity.COMPLEX,
        stepNumber: 0,
        results: JSON.stringify({ summary: 'Agent failed', error: 'Timeout' }),
        status: 'FAILED',
        createdAt: BigInt(Date.now()),
      },
    });

    const response = await request(app)
      .get(`/api/workflows/${workflow.id}/status`)
      .expect(200);

    expect(response.body).toMatchObject({
      workflow_id: workflow.id,
      status: 'FAILED',
      chain_name: 'debug-only',
      complexity: 'complex',
      current_step: 0,
      total_steps: 1,
    });

    expect(response.body.completed_agents).toHaveLength(1);
    expect(response.body.completed_agents[0].status).toBe('FAILED');
  });

  it('should return empty completed_agents for workflow with no agent results', async () => {
    // Create workflow without any agent results
    const workflow = await workflowRepo.createWorkflow({
      userPrompt: 'Review code',
      chainName: ChainName.REVIEW_ONLY,
      complexity: Complexity.MODERATE,
      currentStep: 0,
      status: WorkflowStatus.ACTIVE,
    });

    const response = await request(app)
      .get(`/api/workflows/${workflow.id}/status`)
      .expect(200);

    expect(response.body).toMatchObject({
      workflow_id: workflow.id,
      status: 'ACTIVE',
      chain_name: 'review-only',
      complexity: 'moderate',
      current_step: 0,
      total_steps: 1,
      completed_agents: [],
    });
  });

  it('should include summary field in response', async () => {
    // Create workflow with some progress
    const workflow = await workflowRepo.createWorkflow({
      userPrompt: 'Simple backend task',
      chainName: ChainName.BACKEND_ONLY,
      complexity: Complexity.SIMPLE,
      currentStep: 0,
      status: WorkflowStatus.ACTIVE,
    });

    const response = await request(app)
      .get(`/api/workflows/${workflow.id}/status`)
      .expect(200);

    expect(response.body).toHaveProperty('summary');
    expect(typeof response.body.summary).toBe('string');
  });

  it('should return agent results in correct order by step_number', async () => {
    const workflow = await workflowRepo.createWorkflow({
      userPrompt: 'Backend development',
      chainName: ChainName.BACKEND_DEVELOPMENT,
      complexity: Complexity.MODERATE,
      currentStep: 2,
      status: WorkflowStatus.ACTIVE,
    });

    // Create agent results out of order
    const now = BigInt(Date.now());
    await prisma.agentResult.create({
      data: {
        workflowId: workflow.id,
        agentRole: AgentRole.BACKEND_DEVELOPER,
        complexity: Complexity.MODERATE,
        stepNumber: 1,
        results: JSON.stringify({ summary: 'Development complete' }),
        status: 'COMPLETED',
        createdAt: now,
      },
    });

    await prisma.agentResult.create({
      data: {
        workflowId: workflow.id,
        agentRole: AgentRole.BACKEND_ARCHITECT,
        complexity: Complexity.MODERATE,
        stepNumber: 0,
        results: JSON.stringify({ summary: 'Architecture designed' }),
        status: 'COMPLETED',
        createdAt: now + BigInt(1000),
      },
    });

    const response = await request(app)
      .get(`/api/workflows/${workflow.id}/status`)
      .expect(200);

    expect(response.body.completed_agents).toHaveLength(2);
    expect(response.body.completed_agents[0].step).toBe(0);
    expect(response.body.completed_agents[1].step).toBe(1);
  });
});
