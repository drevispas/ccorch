/**
 * PostToolUse Hook Handler Tests
 *
 * WBS Task: 6.1 Hook Adapters
 * Tests the PostToolUse hook handler that processes agent results
 * and returns next agent prompts or completion messages.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handlePostToolUse } from '../../../src/hooks/post-tool-use';
import { Orchestrator } from '../../../src/services/orchestrator';
import { StateManager } from '../../../src/services/state-manager';
import { PrismaClient } from '@prisma/client';
import { WorkflowRepository } from '../../../src/models/workflow-repository';
import { AgentResultRepository } from '../../../src/models/agent-result-repository';
import { TransitionRepository } from '../../../src/models/transition-repository';
import { AgentRole } from '../../../src/types/workflow';

const prisma = new PrismaClient();

describe('PostToolUse Hook Handler', () => {
  let orchestrator: Orchestrator;
  let stateManager: StateManager;
  let agentResultRepo: AgentResultRepository;

  beforeEach(async () => {
    // Clean up database
    await prisma.agentResult.deleteMany();
    await prisma.workflowTransition.deleteMany();
    await prisma.workflow.deleteMany();

    // Initialize repositories and services
    const workflowRepo = new WorkflowRepository(prisma);
    agentResultRepo = new AgentResultRepository(prisma);
    const transitionRepo = new TransitionRepository(prisma);

    stateManager = new StateManager(workflowRepo, transitionRepo);
    orchestrator = new Orchestrator(stateManager, agentResultRepo);
  });

  describe('Agent completion with results', () => {
    it('should extract results from payload and return next agent prompt', async () => {
      // Create workflow first
      const workflow = await stateManager.createWorkflow({
        userPrompt: 'Design REST API for authentication',
        chainName: 'backend-development',
        complexity: 'moderate',
        draftComplexity: undefined,
      });

      const payload = {
        session_id: 'test-session-001',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse',
        tool_name: 'Task',
        workflow_id: workflow.id,
        agent_role: 'backend-architect',
        complexity: 'moderate',
        step_number: 0,
        results: {
          summary: 'Designed authentication API',
          design: 'RESTful endpoints for login/logout',
          recommendations: ['Add rate limiting', 'Use JWT tokens'],
        },
      };

      const response = await handlePostToolUse(payload, orchestrator);

      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message).toContain('subagent');
      expect(response.message).toContain('backend-developer');
      expect(response.message).toContain('moderate');
    });

    it('should include previous context in next agent prompt (PRD §6.2)', async () => {
      // Create workflow
      const workflow = await stateManager.createWorkflow({
        userPrompt: 'Implement user authentication',
        chainName: 'backend-development',
        complexity: 'moderate',
        draftComplexity: undefined,
      });

      // First agent completes
      const payload = {
        session_id: 'test-session-002',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse',
        tool_name: 'Task',
        workflow_id: workflow.id,
        agent_role: 'backend-architect',
        complexity: 'moderate',
        step_number: 0,
        results: {
          summary: 'Architecture designed',
          design: 'JWT-based authentication with refresh tokens',
        },
      };

      const response = await handlePostToolUse(payload, orchestrator);

      // PRD §6.2: Should include "Review previous results:"
      expect(response.message).toContain('Review previous results');
      expect(response.message).toContain('Architecture designed');
    });

    it('should return next agent prompt in PRD §6.2 format', async () => {
      // Create workflow
      const workflow = await stateManager.createWorkflow({
        userPrompt: 'Create user service',
        chainName: 'backend-development',
        complexity: 'simple',
        draftComplexity: undefined,
      });

      const payload = {
        session_id: 'test-session-003',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse',
        tool_name: 'Task',
        workflow_id: workflow.id,
        agent_role: 'backend-architect',
        complexity: 'simple',
        step_number: 0,
        results: {
          summary: 'Service architecture complete',
        },
      };

      const response = await handlePostToolUse(payload, orchestrator);

      // PRD §6.2: "Use the {agent-role}-{complexity} subagent to:\nReview previous results:\n{context}\n\nContinue with: {userPrompt}"
      expect(response.message).toMatch(/^Use the backend-developer-simple subagent to:/);
      expect(response.message).toContain('Review previous results');
      expect(response.message).toContain('Continue with:');
    });
  });

  describe('Workflow completion', () => {
    it('should return completion message when chain ends', async () => {
      // Create single-agent workflow (review-only)
      const workflow = await stateManager.createWorkflow({
        userPrompt: 'Review authentication code',
        chainName: 'review-only',
        complexity: 'simple',
        draftComplexity: undefined,
      });

      const payload = {
        session_id: 'test-session-004',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse',
        tool_name: 'Task',
        workflow_id: workflow.id,
        agent_role: 'reviewer',
        complexity: 'simple',
        step_number: 0,
        results: {
          summary: 'Code review complete',
          issues_found: [],
        },
      };

      const response = await handlePostToolUse(payload, orchestrator);

      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message).toContain('complete');
    });

    it('should return completion message for multi-step workflow', async () => {
      // Create workflow and simulate all steps
      const workflow = await stateManager.createWorkflow({
        userPrompt: 'Implement payment service',
        chainName: 'backend-development',
        complexity: 'moderate',
        draftComplexity: undefined,
      });

      // Step 1: Architect completes
      await orchestrator.handleAgentComplete(workflow.id, {
        workflowId: workflow.id,
        agentRole: AgentRole.BACKEND_ARCHITECT,
        complexity: 'moderate',
        stepNumber: 0,
        status: 'COMPLETED',
        results: JSON.stringify({ summary: 'Architecture designed' }),
      });

      // Step 2: Developer completes
      await orchestrator.handleAgentComplete(workflow.id, {
        workflowId: workflow.id,
        agentRole: AgentRole.BACKEND_DEVELOPER,
        complexity: 'moderate',
        stepNumber: 1,
        status: 'COMPLETED',
        results: JSON.stringify({ summary: 'Implementation complete' }),
      });

      // Step 3: Reviewer completes (final step)
      const payload = {
        session_id: 'test-session-005',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse',
        tool_name: 'Task',
        workflow_id: workflow.id,
        agent_role: 'reviewer',
        complexity: 'moderate',
        step_number: 2,
        results: {
          summary: 'Review complete',
          issues_found: [],
        },
      };

      const response = await handlePostToolUse(payload, orchestrator);

      expect(response.message).toContain('complete');
    });
  });

  describe('Error handling', () => {
    it('should return error for invalid workflow ID', async () => {
      const payload = {
        session_id: 'test-session-006',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse',
        tool_name: 'Task',
        workflow_id: 'nonexistent-workflow-id',
        agent_role: 'backend-architect',
        complexity: 'moderate',
        step_number: 0,
        results: {
          summary: 'Done',
        },
      };

      const response = await handlePostToolUse(payload, orchestrator);

      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message?.toLowerCase()).toContain('error');
    });

    it('should return error for missing results in payload', async () => {
      const workflow = await stateManager.createWorkflow({
        userPrompt: 'Test workflow',
        chainName: 'backend-development',
        complexity: 'moderate',
        draftComplexity: undefined,
      });

      const payload = {
        session_id: 'test-session-007',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse',
        tool_name: 'Task',
        workflow_id: workflow.id,
        agent_role: 'backend-architect',
        complexity: 'moderate',
        step_number: 0,
        // results field missing
      };

      const response = await handlePostToolUse(payload as any, orchestrator);

      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message?.toLowerCase()).toContain('error');
    });

    it('should return error for missing workflow_id', async () => {
      const payload = {
        session_id: 'test-session-008',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse',
        tool_name: 'Task',
        // workflow_id missing
        agent_role: 'backend-architect',
        complexity: 'moderate',
        step_number: 0,
        results: {
          summary: 'Done',
        },
      };

      const response = await handlePostToolUse(payload as any, orchestrator);

      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message?.toLowerCase()).toContain('error');
    });

    it('should return validation error for malformed results JSON', async () => {
      const workflow = await stateManager.createWorkflow({
        userPrompt: 'Test workflow',
        chainName: 'backend-development',
        complexity: 'moderate',
        draftComplexity: undefined,
      });

      const payload = {
        session_id: 'test-session-009',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse',
        tool_name: 'Task',
        workflow_id: workflow.id,
        agent_role: 'backend-architect',
        complexity: 'moderate',
        step_number: 0,
        results: 'not-an-object', // Invalid: should be object
      };

      const response = await handlePostToolUse(payload as any, orchestrator);

      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message?.toLowerCase()).toContain('error');
    });
  });

  describe('Idempotency', () => {
    it('should handle duplicate step submission', async () => {
      // Create workflow
      const workflow = await stateManager.createWorkflow({
        userPrompt: 'Test idempotency',
        chainName: 'backend-development',
        complexity: 'moderate',
        draftComplexity: undefined,
      });

      // First submission
      const payload = {
        session_id: 'test-session-010',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse',
        tool_name: 'Task',
        workflow_id: workflow.id,
        agent_role: 'backend-architect',
        complexity: 'moderate',
        step_number: 0,
        results: {
          summary: 'First submission',
        },
      };

      const response1 = await handlePostToolUse(payload, orchestrator);
      expect(response1.message).toContain('backend-developer');

      // Duplicate submission (same step)
      const response2 = await handlePostToolUse(payload, orchestrator);

      // Should handle gracefully (may return error or ignore)
      expect(response2).toBeDefined();
      expect(response2.message).toBeDefined();
    });
  });

  describe('Response format validation', () => {
    it('should return response conforming to Claude Code hook spec', async () => {
      const workflow = await stateManager.createWorkflow({
        userPrompt: 'Test response format',
        chainName: 'backend-development',
        complexity: 'moderate',
        draftComplexity: undefined,
      });

      const payload = {
        session_id: 'test-session-011',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse',
        tool_name: 'Task',
        workflow_id: workflow.id,
        agent_role: 'backend-architect',
        complexity: 'moderate',
        step_number: 0,
        results: {
          summary: 'Done',
        },
      };

      const response = await handlePostToolUse(payload, orchestrator);

      // Hook response should have optional fields: message, decision, hookSpecificOutput
      expect(response).toHaveProperty('message');
      expect(typeof response.message).toBe('string');

      // decision is optional, but if present should be 'allow' or 'block'
      if ('decision' in response) {
        expect(['allow', 'block']).toContain(response.decision);
      }

      // hookSpecificOutput is optional
      if ('hookSpecificOutput' in response) {
        expect(typeof response.hookSpecificOutput).toBe('object');
      }
    });
  });
});
