import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { AgentResultModel } from '../../../src/models/agent-result';
import { WorkflowModel } from '../../../src/models/workflow';

/**
 * Unit tests for AgentResult model
 *
 * Test Suite: AgentResult Model CRUD Operations
 * Purpose: Validate agent result creation, retrieval, unique constraints, and cascading deletes
 * Database: In-memory SQLite for test isolation
 *
 * Key validation: (workflowId, stepNumber) unique constraint for idempotency
 *
 * Following TDD approach - these tests will fail (red) until implementation is complete
 */

describe('AgentResult Model', () => {
  let prisma: PrismaClient;
  let agentResultModel: AgentResultModel;
  let workflowModel: WorkflowModel;
  let testWorkflowId: string;

  beforeEach(async () => {
    // Initialize Prisma with in-memory SQLite database
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: 'file::memory:?cache=shared'
        }
      }
    });

    // Run migrations to set up schema
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');

    agentResultModel = new AgentResultModel(prisma);
    workflowModel = new WorkflowModel(prisma);

    // Create a test workflow for foreign key relationships
    const workflow = await workflowModel.createWorkflow({
      userPrompt: 'Test workflow for agent results',
      chainName: 'backend-development',
      complexity: 'moderate',
      currentStep: 0,
      status: 'ACTIVE'
    });
    testWorkflowId = workflow.id;
  });

  afterEach(async () => {
    // Clean up database connections
    await prisma.$disconnect();
  });

  describe('createResult()', () => {
    it('should create an agent result with all required fields', async () => {
      const resultData = {
        workflowId: testWorkflowId,
        agentRole: 'architect',
        complexity: 'moderate' as const,
        stepNumber: 0,
        results: JSON.stringify({
          summary: 'Architecture design completed',
          design: {
            components: ['API Gateway', 'Auth Service', 'User Service'],
            patterns: ['Microservices', 'Event-driven']
          }
        }),
        status: 'COMPLETED' as const
      };

      const agentResult = await agentResultModel.createResult(resultData);

      expect(agentResult).toBeDefined();
      expect(agentResult.id).toBeGreaterThan(0);
      expect(agentResult.workflowId).toBe(testWorkflowId);
      expect(agentResult.agentRole).toBe('architect');
      expect(agentResult.complexity).toBe('moderate');
      expect(agentResult.stepNumber).toBe(0);
      expect(agentResult.status).toBe('COMPLETED');
      expect(agentResult.createdAt).toBeGreaterThan(0);

      // Verify JSON results can be parsed
      const parsedResults = JSON.parse(agentResult.results);
      expect(parsedResults.summary).toBe('Architecture design completed');
    });

    it('should auto-increment ID for multiple results', async () => {
      const result1 = await agentResultModel.createResult({
        workflowId: testWorkflowId,
        agentRole: 'architect',
        complexity: 'simple',
        stepNumber: 0,
        results: JSON.stringify({ summary: 'First result' }),
        status: 'COMPLETED'
      });

      const result2 = await agentResultModel.createResult({
        workflowId: testWorkflowId,
        agentRole: 'backend-developer',
        complexity: 'simple',
        stepNumber: 1,
        results: JSON.stringify({ summary: 'Second result' }),
        status: 'COMPLETED'
      });

      expect(result2.id).toBeGreaterThan(result1.id);
    });

    it('should set default status to COMPLETED when not specified', async () => {
      const result = await agentResultModel.createResult({
        workflowId: testWorkflowId,
        agentRole: 'reviewer',
        complexity: 'moderate',
        stepNumber: 2,
        results: JSON.stringify({ summary: 'Review complete' })
      });

      expect(result.status).toBe('COMPLETED');
    });

    it('should support different agent roles', async () => {
      const roles = ['architect', 'backend-developer', 'frontend-developer', 'reviewer', 'debugger'];

      for (let i = 0; i < roles.length; i++) {
        const result = await agentResultModel.createResult({
          workflowId: testWorkflowId,
          agentRole: roles[i],
          complexity: 'moderate',
          stepNumber: i,
          results: JSON.stringify({ summary: `${roles[i]} completed` }),
          status: 'COMPLETED'
        });

        expect(result.agentRole).toBe(roles[i]);
      }
    });

    it('should support different complexity levels', async () => {
      const complexities = ['simple', 'moderate', 'complex'] as const;

      for (let i = 0; i < complexities.length; i++) {
        const result = await agentResultModel.createResult({
          workflowId: testWorkflowId,
          agentRole: 'backend-developer',
          complexity: complexities[i],
          stepNumber: i,
          results: JSON.stringify({ summary: 'Done' }),
          status: 'COMPLETED'
        });

        expect(result.complexity).toBe(complexities[i]);
      }
    });

    it('should support different result statuses', async () => {
      const statuses = ['COMPLETED', 'FAILED', 'PARTIAL', 'SKIPPED'] as const;

      for (let i = 0; i < statuses.length; i++) {
        const result = await agentResultModel.createResult({
          workflowId: testWorkflowId,
          agentRole: 'debugger',
          complexity: 'moderate',
          stepNumber: i,
          results: JSON.stringify({ summary: `Status: ${statuses[i]}` }),
          status: statuses[i]
        });

        expect(result.status).toBe(statuses[i]);
      }
    });
  });

  describe('findByWorkflowId()', () => {
    it('should find all agent results for a given workflow', async () => {
      // Create multiple results for the test workflow
      await agentResultModel.createResult({
        workflowId: testWorkflowId,
        agentRole: 'architect',
        complexity: 'moderate',
        stepNumber: 0,
        results: JSON.stringify({ summary: 'Step 0' }),
        status: 'COMPLETED'
      });

      await agentResultModel.createResult({
        workflowId: testWorkflowId,
        agentRole: 'backend-developer',
        complexity: 'moderate',
        stepNumber: 1,
        results: JSON.stringify({ summary: 'Step 1' }),
        status: 'COMPLETED'
      });

      await agentResultModel.createResult({
        workflowId: testWorkflowId,
        agentRole: 'reviewer',
        complexity: 'moderate',
        stepNumber: 2,
        results: JSON.stringify({ summary: 'Step 2' }),
        status: 'COMPLETED'
      });

      const results = await agentResultModel.findByWorkflowId(testWorkflowId);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.workflowId === testWorkflowId)).toBe(true);
    });

    it('should return results ordered by stepNumber', async () => {
      // Create results in non-sequential order
      await agentResultModel.createResult({
        workflowId: testWorkflowId,
        agentRole: 'reviewer',
        complexity: 'moderate',
        stepNumber: 2,
        results: JSON.stringify({ summary: 'Step 2' }),
        status: 'COMPLETED'
      });

      await agentResultModel.createResult({
        workflowId: testWorkflowId,
        agentRole: 'architect',
        complexity: 'moderate',
        stepNumber: 0,
        results: JSON.stringify({ summary: 'Step 0' }),
        status: 'COMPLETED'
      });

      await agentResultModel.createResult({
        workflowId: testWorkflowId,
        agentRole: 'backend-developer',
        complexity: 'moderate',
        stepNumber: 1,
        results: JSON.stringify({ summary: 'Step 1' }),
        status: 'COMPLETED'
      });

      const results = await agentResultModel.findByWorkflowId(testWorkflowId);

      expect(results[0].stepNumber).toBe(0);
      expect(results[1].stepNumber).toBe(1);
      expect(results[2].stepNumber).toBe(2);
    });

    it('should return empty array for workflow with no results', async () => {
      // Create a new workflow with no results
      const newWorkflow = await workflowModel.createWorkflow({
        userPrompt: 'Empty workflow',
        chainName: 'frontend-development',
        complexity: 'simple',
        currentStep: 0,
        status: 'ACTIVE'
      });

      const results = await agentResultModel.findByWorkflowId(newWorkflow.id);

      expect(results).toEqual([]);
    });

    it('should return empty array for non-existent workflow ID', async () => {
      const nonExistentId = '00000000-0000-4000-8000-000000000000';
      const results = await agentResultModel.findByWorkflowId(nonExistentId);

      expect(results).toEqual([]);
    });

    it('should not return results from other workflows', async () => {
      // Create another workflow
      const otherWorkflow = await workflowModel.createWorkflow({
        userPrompt: 'Other workflow',
        chainName: 'debug',
        complexity: 'complex',
        currentStep: 0,
        status: 'ACTIVE'
      });

      // Create result for other workflow
      await agentResultModel.createResult({
        workflowId: otherWorkflow.id,
        agentRole: 'debugger',
        complexity: 'complex',
        stepNumber: 0,
        results: JSON.stringify({ summary: 'Other workflow result' }),
        status: 'COMPLETED'
      });

      // Create result for test workflow
      await agentResultModel.createResult({
        workflowId: testWorkflowId,
        agentRole: 'architect',
        complexity: 'moderate',
        stepNumber: 0,
        results: JSON.stringify({ summary: 'Test workflow result' }),
        status: 'COMPLETED'
      });

      const results = await agentResultModel.findByWorkflowId(testWorkflowId);

      expect(results).toHaveLength(1);
      expect(results[0].workflowId).toBe(testWorkflowId);
    });
  });

  describe('unique constraint on (workflowId, stepNumber)', () => {
    it('should enforce unique constraint on (workflowId, stepNumber)', async () => {
      // Create first result
      await agentResultModel.createResult({
        workflowId: testWorkflowId,
        agentRole: 'architect',
        complexity: 'moderate',
        stepNumber: 0,
        results: JSON.stringify({ summary: 'First attempt' }),
        status: 'COMPLETED'
      });

      // Attempt to create duplicate (same workflowId and stepNumber)
      await expect(
        agentResultModel.createResult({
          workflowId: testWorkflowId,
          agentRole: 'backend-developer', // Different role, but same workflowId + stepNumber
          complexity: 'moderate',
          stepNumber: 0,
          results: JSON.stringify({ summary: 'Second attempt' }),
          status: 'COMPLETED'
        })
      ).rejects.toThrow();
    });

    it('should allow same stepNumber for different workflows', async () => {
      // Create another workflow
      const otherWorkflow = await workflowModel.createWorkflow({
        userPrompt: 'Another workflow',
        chainName: 'frontend-development',
        complexity: 'simple',
        currentStep: 0,
        status: 'ACTIVE'
      });

      // Create result with stepNumber 0 for first workflow
      const result1 = await agentResultModel.createResult({
        workflowId: testWorkflowId,
        agentRole: 'architect',
        complexity: 'moderate',
        stepNumber: 0,
        results: JSON.stringify({ summary: 'Workflow 1, Step 0' }),
        status: 'COMPLETED'
      });

      // Create result with stepNumber 0 for second workflow (should succeed)
      const result2 = await agentResultModel.createResult({
        workflowId: otherWorkflow.id,
        agentRole: 'architect',
        complexity: 'simple',
        stepNumber: 0,
        results: JSON.stringify({ summary: 'Workflow 2, Step 0' }),
        status: 'COMPLETED'
      });

      expect(result1.workflowId).toBe(testWorkflowId);
      expect(result2.workflowId).toBe(otherWorkflow.id);
      expect(result1.stepNumber).toBe(0);
      expect(result2.stepNumber).toBe(0);
    });

    it('should allow different stepNumbers for same workflow', async () => {
      const result1 = await agentResultModel.createResult({
        workflowId: testWorkflowId,
        agentRole: 'architect',
        complexity: 'moderate',
        stepNumber: 0,
        results: JSON.stringify({ summary: 'Step 0' }),
        status: 'COMPLETED'
      });

      const result2 = await agentResultModel.createResult({
        workflowId: testWorkflowId,
        agentRole: 'backend-developer',
        complexity: 'moderate',
        stepNumber: 1,
        results: JSON.stringify({ summary: 'Step 1' }),
        status: 'COMPLETED'
      });

      const result3 = await agentResultModel.createResult({
        workflowId: testWorkflowId,
        agentRole: 'reviewer',
        complexity: 'moderate',
        stepNumber: 2,
        results: JSON.stringify({ summary: 'Step 2' }),
        status: 'COMPLETED'
      });

      expect(result1.stepNumber).toBe(0);
      expect(result2.stepNumber).toBe(1);
      expect(result3.stepNumber).toBe(2);
    });

    it('should provide idempotency for result submission', async () => {
      // Simulate agent retry scenario
      const resultData = {
        workflowId: testWorkflowId,
        agentRole: 'architect',
        complexity: 'moderate' as const,
        stepNumber: 0,
        results: JSON.stringify({ summary: 'Idempotent result' }),
        status: 'COMPLETED' as const
      };

      // First submission succeeds
      const result1 = await agentResultModel.createResult(resultData);

      // Retry with same workflowId and stepNumber should fail
      // This prevents duplicate results from hook retries
      await expect(
        agentResultModel.createResult(resultData)
      ).rejects.toThrow();

      // Verify only one result exists
      const results = await agentResultModel.findByWorkflowId(testWorkflowId);
      expect(results).toHaveLength(1);
    });
  });

  describe('cascade delete when workflow deleted', () => {
    it('should delete all agent results when workflow is deleted', async () => {
      // Create multiple results for the workflow
      await agentResultModel.createResult({
        workflowId: testWorkflowId,
        agentRole: 'architect',
        complexity: 'moderate',
        stepNumber: 0,
        results: JSON.stringify({ summary: 'Step 0' }),
        status: 'COMPLETED'
      });

      await agentResultModel.createResult({
        workflowId: testWorkflowId,
        agentRole: 'backend-developer',
        complexity: 'moderate',
        stepNumber: 1,
        results: JSON.stringify({ summary: 'Step 1' }),
        status: 'COMPLETED'
      });

      await agentResultModel.createResult({
        workflowId: testWorkflowId,
        agentRole: 'reviewer',
        complexity: 'moderate',
        stepNumber: 2,
        results: JSON.stringify({ summary: 'Step 2' }),
        status: 'COMPLETED'
      });

      // Verify results exist
      let results = await agentResultModel.findByWorkflowId(testWorkflowId);
      expect(results).toHaveLength(3);

      // Delete the workflow
      await workflowModel.deleteWorkflow(testWorkflowId);

      // Verify all results are deleted
      results = await agentResultModel.findByWorkflowId(testWorkflowId);
      expect(results).toEqual([]);
    });

    it('should only delete results for the deleted workflow', async () => {
      // Create another workflow
      const otherWorkflow = await workflowModel.createWorkflow({
        userPrompt: 'Other workflow',
        chainName: 'frontend-development',
        complexity: 'simple',
        currentStep: 0,
        status: 'ACTIVE'
      });

      // Create results for both workflows
      await agentResultModel.createResult({
        workflowId: testWorkflowId,
        agentRole: 'architect',
        complexity: 'moderate',
        stepNumber: 0,
        results: JSON.stringify({ summary: 'Test workflow result' }),
        status: 'COMPLETED'
      });

      await agentResultModel.createResult({
        workflowId: otherWorkflow.id,
        agentRole: 'architect',
        complexity: 'simple',
        stepNumber: 0,
        results: JSON.stringify({ summary: 'Other workflow result' }),
        status: 'COMPLETED'
      });

      // Delete the test workflow
      await workflowModel.deleteWorkflow(testWorkflowId);

      // Verify test workflow results are deleted
      const testResults = await agentResultModel.findByWorkflowId(testWorkflowId);
      expect(testResults).toEqual([]);

      // Verify other workflow results still exist
      const otherResults = await agentResultModel.findByWorkflowId(otherWorkflow.id);
      expect(otherResults).toHaveLength(1);
      expect(otherResults[0].workflowId).toBe(otherWorkflow.id);
    });

    it('should handle cascade delete with no results gracefully', async () => {
      // Create a workflow with no results
      const emptyWorkflow = await workflowModel.createWorkflow({
        userPrompt: 'Empty workflow',
        chainName: 'review',
        complexity: 'simple',
        currentStep: 0,
        status: 'ACTIVE'
      });

      // Delete should succeed even with no results
      await expect(
        workflowModel.deleteWorkflow(emptyWorkflow.id)
      ).resolves.toBe(true);

      const workflow = await workflowModel.findById(emptyWorkflow.id);
      expect(workflow).toBeNull();
    });
  });
});
