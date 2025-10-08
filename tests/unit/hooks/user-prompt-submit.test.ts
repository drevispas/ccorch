/**
 * UserPromptSubmit Hook Handler Tests
 *
 * WBS Task: 6.1 Hook Adapters
 * Tests the UserPromptSubmit hook handler that intercepts user prompts
 * and returns agent injection responses.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleUserPromptSubmit } from '../../../src/hooks/user-prompt-submit';
import { Orchestrator } from '../../../src/services/orchestrator';
import { StateManager } from '../../../src/services/state-manager';
import { PrismaClient } from '@prisma/client';
import { WorkflowRepository } from '../../../src/models/workflow-repository';
import { AgentResultRepository } from '../../../src/models/agent-result-repository';
import { TransitionRepository } from '../../../src/models/transition-repository';

const prisma = new PrismaClient();

describe('UserPromptSubmit Hook Handler', () => {
  let orchestrator: Orchestrator;
  let stateManager: StateManager;

  beforeEach(async () => {
    // Clean up database
    await prisma.agentResult.deleteMany();
    await prisma.workflowTransition.deleteMany();
    await prisma.workflow.deleteMany();

    // Initialize repositories and services
    const workflowRepo = new WorkflowRepository(prisma);
    const agentResultRepo = new AgentResultRepository(prisma);
    const transitionRepo = new TransitionRepository(prisma);

    stateManager = new StateManager(workflowRepo, transitionRepo);
    orchestrator = new Orchestrator(stateManager, agentResultRepo);
  });

  describe('Valid prompt processing', () => {
    it('should return agent injection response for valid backend prompt', async () => {
      const payload = {
        session_id: 'test-session-001',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: '\\cco Implement REST API for user authentication',
      };

      const response = await handleUserPromptSubmit(payload, orchestrator);

      expect(response).toBeDefined();
      expect(response.hookResponse).toBeDefined();
      expect(response.hookResponse.hookSpecificOutput?.additionalContext).toBeDefined();
      expect(response.hookResponse.hookSpecificOutput?.additionalContext).toContain('backend-architect');
      expect(response.workflowId).toBeDefined();
    });

    it('should return agent injection response for valid frontend prompt', async () => {
      const payload = {
        session_id: 'test-session-002',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: '\\cco Create React component for user profile page',
      };

      const response = await handleUserPromptSubmit(payload, orchestrator);

      expect(response).toBeDefined();
      expect(response.hookResponse).toBeDefined();
      expect(response.hookResponse.hookSpecificOutput?.additionalContext).toBeDefined();
      expect(response.hookResponse.hookSpecificOutput?.additionalContext).toContain('frontend-architect');
      expect(response.workflowId).toBeDefined();
    });

    it('should return agent injection response for debug prompt', async () => {
      const payload = {
        session_id: 'test-session-003',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: '\\cco Fix NullPointerException in authentication service',
      };

      const response = await handleUserPromptSubmit(payload, orchestrator);

      expect(response).toBeDefined();
      expect(response.hookResponse.hookSpecificOutput?.additionalContext).toBeDefined();
      expect(response.hookResponse.hookSpecificOutput?.additionalContext).toContain('issue-detective');
      expect(response.workflowId).toBeDefined();
    });

    it('should return response with Task tool invocation format', async () => {
      const payload = {
        session_id: 'test-session-004',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: '\\cco Add logging to payment service',
      };

      const response = await handleUserPromptSubmit(payload, orchestrator);

      const context = response.hookResponse.hookSpecificOutput?.additionalContext || '';
      expect(context).toContain('Task tool');
      expect(context).toContain('subagent_type');
    });

    it('should not include API submission reminder in response', async () => {
      const payload = {
        session_id: 'test-session-005',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: '\\cco Refactor user repository',
      };

      const response = await handleUserPromptSubmit(payload, orchestrator);

      const context = response.hookResponse.hookSpecificOutput?.additionalContext || '';
      expect(context).not.toContain('POST /api');
    });
  });

  describe('Invalid payload handling', () => {
    it('should return error response for missing prompt field', async () => {
      const payload = {
        session_id: 'test-session-006',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        // prompt is missing
      };

      const response = await handleUserPromptSubmit(payload as any, orchestrator);

      expect(response).toBeDefined();
      expect(response.hookResponse.message).toBeDefined();
      expect(response.hookResponse.message?.toLowerCase()).toContain('error');
    });

    it('should return error response for empty prompt', async () => {
      const payload = {
        session_id: 'test-session-007',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: '',
      };

      const response = await handleUserPromptSubmit(payload, orchestrator);

      expect(response).toBeDefined();
      expect(response.hookResponse.message).toBeDefined();
      expect(response.hookResponse.message?.toLowerCase()).toContain('error');
    });

    it('should skip orchestration for whitespace-only prompt without trigger', async () => {
      const payload = {
        session_id: 'test-session-008',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: '   \n\t   ',
      };

      const response = await handleUserPromptSubmit(payload, orchestrator);

      expect(response).toBeDefined();
      expect(response.hookResponse.continue).toBe(true);
      expect(response.hookResponse.hookSpecificOutput?.additionalContext).toBeUndefined();
      expect(response.workflowId).toBeUndefined();
    });
  });

  describe('Orchestrator error handling', () => {
    it('should return fallback error message when orchestrator fails', async () => {
      const payload = {
        session_id: 'test-session-009',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: '\\cco Valid prompt',
      };

      // Create a failing orchestrator by passing invalid dependencies
      const failingOrchestrator = new Orchestrator(null as any, null as any);

      const response = await handleUserPromptSubmit(payload, failingOrchestrator);

      expect(response).toBeDefined();
      expect(response.hookResponse.message).toBeDefined();
      expect(response.hookResponse.message?.toLowerCase()).toContain('error');
      expect(response.hookResponse.message).toContain('Failed to process');
    });
  });

  describe('Response format validation', () => {
    it('should return response conforming to Claude Code hook spec', async () => {
      const payload = {
        session_id: 'test-session-010',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: '\\cco Implement user service',
      };

      const response = await handleUserPromptSubmit(payload, orchestrator);

      // Handler returns HandlerResponse with hookResponse and workflowId
      expect(response).toHaveProperty('hookResponse');
      expect(response.hookResponse).toBeDefined();
      expect(response.hookResponse.continue).toBe(true);
      expect(response.hookResponse.hookSpecificOutput).toBeDefined();
      expect(response.hookResponse.hookSpecificOutput?.hookEventName).toBe('UserPromptSubmit');
      expect(response.hookResponse.hookSpecificOutput?.additionalContext).toBeDefined();
      expect(response.workflowId).toBeDefined();
    });
  });

  describe('Trigger detection (\\cco and \\c2o prefixes)', () => {
    it('should trigger orchestration with \\cco prefix', async () => {
      const payload = {
        session_id: 'test-session-trigger-001',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: '\\cco Design a REST API for user management',
      };

      const response = await handleUserPromptSubmit(payload, orchestrator);

      expect(response).toBeDefined();
      expect(response.hookResponse).toBeDefined();
      expect(response.hookResponse.hookSpecificOutput?.additionalContext).toBeDefined();
      expect(response.hookResponse.hookSpecificOutput?.additionalContext).toContain('backend-architect');
      expect(response.workflowId).toBeDefined();
    });

    it('should trigger orchestration with \\c2o prefix (alias)', async () => {
      const payload = {
        session_id: 'test-session-trigger-002',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: '\\c2o Implement authentication system',
      };

      const response = await handleUserPromptSubmit(payload, orchestrator);

      expect(response).toBeDefined();
      expect(response.hookResponse).toBeDefined();
      expect(response.hookResponse.hookSpecificOutput?.additionalContext).toBeDefined();
      expect(response.workflowId).toBeDefined();
    });

    it('should work with case-insensitive trigger (\\CCO)', async () => {
      const payload = {
        session_id: 'test-session-trigger-003',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: '\\CCO Design a frontend component',
      };

      const response = await handleUserPromptSubmit(payload, orchestrator);

      expect(response).toBeDefined();
      expect(response.hookResponse.hookSpecificOutput?.additionalContext).toBeDefined();
      expect(response.workflowId).toBeDefined();
    });

    it('should work with case-insensitive trigger (\\C2O)', async () => {
      const payload = {
        session_id: 'test-session-trigger-004',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: '\\C2O Fix memory leak',
      };

      const response = await handleUserPromptSubmit(payload, orchestrator);

      expect(response).toBeDefined();
      expect(response.hookResponse.hookSpecificOutput?.additionalContext).toBeDefined();
      expect(response.workflowId).toBeDefined();
    });

    it('should handle extra whitespace after trigger', async () => {
      const payload = {
        session_id: 'test-session-trigger-005',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: '\\cco    Design with extra spaces',
      };

      const response = await handleUserPromptSubmit(payload, orchestrator);

      expect(response).toBeDefined();
      expect(response.hookResponse.hookSpecificOutput?.additionalContext).toBeDefined();
      expect(response.workflowId).toBeDefined();
    });

    it('should skip orchestration when no trigger present', async () => {
      const payload = {
        session_id: 'test-session-trigger-006',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Normal conversation without trigger',
      };

      const response = await handleUserPromptSubmit(payload, orchestrator);

      expect(response).toBeDefined();
      expect(response.hookResponse).toBeDefined();
      expect(response.hookResponse.continue).toBe(true);
      expect(response.hookResponse.hookSpecificOutput?.additionalContext).toBeUndefined();
      expect(response.workflowId).toBeUndefined();
    });

    it('should skip orchestration for prompts mentioning trigger in text', async () => {
      const payload = {
        session_id: 'test-session-trigger-007',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Let me tell you about \\cco syntax',
      };

      const response = await handleUserPromptSubmit(payload, orchestrator);

      expect(response).toBeDefined();
      expect(response.hookResponse.hookSpecificOutput?.additionalContext).toBeUndefined();
      expect(response.workflowId).toBeUndefined();
    });

    it('should skip orchestration for trigger without space', async () => {
      const payload = {
        session_id: 'test-session-trigger-008',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: '\\ccoDesign something',
      };

      const response = await handleUserPromptSubmit(payload, orchestrator);

      expect(response).toBeDefined();
      expect(response.hookResponse.hookSpecificOutput?.additionalContext).toBeUndefined();
      expect(response.workflowId).toBeUndefined();
    });

    it('should extract clean prompt without trigger', async () => {
      const payload = {
        session_id: 'test-session-trigger-009',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: '\\cco Design a REST API',
      };

      const response = await handleUserPromptSubmit(payload, orchestrator);

      // The orchestrator should receive "Design a REST API" without the "\cco" prefix
      const context = response.hookResponse.hookSpecificOutput?.additionalContext || '';
      expect(context).not.toContain('\\cco');
    });
  });
});
