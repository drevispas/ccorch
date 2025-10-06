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
        prompt: 'Implement REST API for user authentication',
      };

      const response = await handleUserPromptSubmit(payload, orchestrator);

      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message).toContain('subagent');
      expect(response.message).toMatch(/backend-architect-(simple|moderate|complex)/);
      expect(response.message).toContain('Implement REST API for user authentication');
    });

    it('should return agent injection response for valid frontend prompt', async () => {
      const payload = {
        session_id: 'test-session-002',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Create React component for user profile page',
      };

      const response = await handleUserPromptSubmit(payload, orchestrator);

      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message).toContain('subagent');
      expect(response.message).toMatch(/frontend-architect-(simple|moderate|complex)/);
      expect(response.message).toContain('Create React component for user profile page');
    });

    it('should return agent injection response for debug prompt', async () => {
      const payload = {
        session_id: 'test-session-003',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Fix NullPointerException in authentication service',
      };

      const response = await handleUserPromptSubmit(payload, orchestrator);

      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message).toContain('subagent');
      expect(response.message).toMatch(/debugger-(simple|moderate|complex)/);
    });

    it('should return response in PRD §6.1 format', async () => {
      const payload = {
        session_id: 'test-session-004',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Add logging to payment service',
      };

      const response = await handleUserPromptSubmit(payload, orchestrator);

      // PRD §6.1: "Use the {agent-role}-{complexity} subagent to:\n{userPrompt}"
      expect(response.message).toMatch(/^Use the \w+-\w+-(simple|moderate|complex) subagent to:/);
      expect(response.message).toContain('Add logging to payment service');
    });

    it('should not include API submission reminder in response', async () => {
      const payload = {
        session_id: 'test-session-005',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Refactor user repository',
      };

      const response = await handleUserPromptSubmit(payload, orchestrator);

      // Should NOT mention API submission (that's handled by PostToolUse hook)
      expect(response.message).not.toContain('submit');
      expect(response.message).not.toContain('POST /api');
      expect(response.message).not.toContain('API endpoint');
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
      expect(response.message).toBeDefined();
      expect(response.message?.toLowerCase()).toContain('error');
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
      expect(response.message).toBeDefined();
      expect(response.message?.toLowerCase()).toContain('error');
    });

    it('should return error response for whitespace-only prompt', async () => {
      const payload = {
        session_id: 'test-session-008',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: '   \n\t   ',
      };

      const response = await handleUserPromptSubmit(payload, orchestrator);

      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message?.toLowerCase()).toContain('error');
    });
  });

  describe('Orchestrator error handling', () => {
    it('should return fallback error message when orchestrator fails', async () => {
      const payload = {
        session_id: 'test-session-009',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Valid prompt',
      };

      // Create a failing orchestrator by passing invalid dependencies
      const failingOrchestrator = new Orchestrator(null as any, null as any);

      const response = await handleUserPromptSubmit(payload, failingOrchestrator);

      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message?.toLowerCase()).toContain('error');
      expect(response.message).toContain('Failed to process');
    });
  });

  describe('Response format validation', () => {
    it('should return response conforming to Claude Code hook spec', async () => {
      const payload = {
        session_id: 'test-session-010',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Implement user service',
      };

      const response = await handleUserPromptSubmit(payload, orchestrator);

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
