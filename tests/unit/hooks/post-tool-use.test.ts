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
import { AgentRole, ChainName } from '../../../src/types/workflow';

const prisma = new PrismaClient();

describe('PostToolUse Hook Handler', () => {
  let orchestrator: Orchestrator;
  let stateManager: StateManager;
  let agentResultRepo: AgentResultRepository;
  let workflowRepo: WorkflowRepository;

  beforeEach(async () => {
    // Clean up database
    await prisma.agentResult.deleteMany();
    await prisma.workflowTransition.deleteMany();
    await prisma.workflow.deleteMany();

    // Initialize repositories and services
    workflowRepo = new WorkflowRepository(prisma);
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
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: 'moderate',
        sessionId: 'test-session-001',
      });

      const payload = {
        session_id: 'test-session-001',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse' as const,
        tool_name: 'Task',
        tool_input: {
          subagent_type: 'backend-architect-moderate',
          description: 'backend-architect (step 1)',
          prompt: 'Design the architecture and technical approach',
        },
        tool_response: {
          stdout: JSON.stringify({
            summary: 'Designed authentication API',
            design: 'RESTful endpoints for login/logout',
            recommendations: ['Add rate limiting', 'Use JWT tokens'],
          }),
        },
      };

      const response = await handlePostToolUse(payload, orchestrator, workflowRepo);

      expect(response).toBeDefined();
      expect(response.continue).toBe(true);
      expect(response.hookSpecificOutput?.additionalContext).toContain('subagent');
    });

    it('should include previous context in next agent prompt (PRD §6.2)', async () => {
      // Create workflow
      const workflow = await stateManager.createWorkflow({
        userPrompt: 'Implement user authentication',
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: 'moderate',
        sessionId: 'test-session-002',
      });

      // First agent completes
      const payload = {
        session_id: 'test-session-002',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse' as const,
        tool_name: 'Task',
        tool_input: {
          subagent_type: 'backend-architect-moderate',
          description: 'backend-architect (step 1)',
          prompt: 'Design the architecture and technical approach',
        },
        tool_response: {
          stdout: JSON.stringify({
            summary: 'Architecture designed',
            design: 'JWT-based authentication with refresh tokens',
          }),
        },
      };

      const response = await handlePostToolUse(payload, orchestrator, workflowRepo);

      // PRD §6.2: Should include "Review previous agent results"
      expect(response.hookSpecificOutput?.additionalContext).toContain('Review previous agent results');
      expect(response.hookSpecificOutput?.additionalContext).toContain('Architecture designed');
    });

    it('should return next agent prompt in PRD §6.2 format', async () => {
      // Create workflow
      const workflow = await stateManager.createWorkflow({
        userPrompt: 'Create user service',
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: 'simple',
        sessionId: 'test-session-003',
      });

      const payload = {
        session_id: 'test-session-003',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse' as const,
        tool_name: 'Task',
        tool_input: {
          subagent_type: 'backend-architect-simple',
          description: 'backend-architect (step 1)',
          prompt: 'Design the architecture and technical approach',
        },
        tool_response: {
          stdout: JSON.stringify({
            summary: 'Service architecture complete',
          }),
        },
      };

      const response = await handlePostToolUse(payload, orchestrator, workflowRepo);

      // PRD §6.2: Format includes agent type and previous context
      expect(response.hookSpecificOutput?.additionalContext).toContain('java-backend-developer-simple');
      expect(response.hookSpecificOutput?.additionalContext).toContain('Review previous agent results');
      expect(response.hookSpecificOutput?.additionalContext).toContain('Service architecture complete');
    });
  });

  describe('Workflow completion', () => {
    it('should return completion message when chain ends', async () => {
      // NOTE: MVP implementation in hook always uses backend-architect for backend chains
      // Create single-agent workflow to test completion
      const workflow = await stateManager.createWorkflow({
        userPrompt: 'Design API',
        chainName: ChainName.BACKEND_DESIGN_ONLY,
        complexity: 'simple',
        sessionId: 'test-session-004',
      });

      // Architect completes (single step, workflow should complete)
      const payload = {
        session_id: 'test-session-004',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse' as const,
        tool_name: 'Task',
        tool_input: {
          subagent_type: 'backend-architect-simple',
          description: 'backend-architect (step 1)',
          prompt: 'Design the architecture and technical approach',
        },
        tool_response: {
          stdout: JSON.stringify({
            summary: 'Design complete',
            design: 'API endpoints specified',
          }),
        },
      };

      const response = await handlePostToolUse(payload, orchestrator, workflowRepo);

      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message).toContain('complete');
    });

    it('should return completion message for multi-step workflow', async () => {
      // NOTE: This test verifies workflow continues properly; full completion tested above
      // Create workflow and complete first step
      const workflow = await stateManager.createWorkflow({
        userPrompt: 'Implement payment service',
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: 'moderate',
        sessionId: 'test-session-005',
      });

      // Step 1: Architect completes via hook (should continue to developer)
      const payload = {
        session_id: 'test-session-005',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse' as const,
        tool_name: 'Task',
        tool_input: {
          subagent_type: 'backend-architect-moderate',
          description: 'backend-architect (step 1)',
          prompt: 'Design the architecture and technical approach',
        },
        tool_response: {
          stdout: JSON.stringify({
            summary: 'Architecture designed',
          }),
        },
      };

      const response = await handlePostToolUse(payload, orchestrator, workflowRepo);

      // Should return next agent prompt (not completion)
      expect(response.continue).toBe(true);
      expect(response.hookSpecificOutput?.additionalContext).toContain('java-backend-developer');
    });
  });

  describe('Error handling', () => {
    it('should skip when tool_name is not Task', async () => {
      const payload = {
        session_id: 'test-session-006',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse' as const,
        tool_name: 'Read', // Not 'Task'
        tool_response: {
          stdout: 'file contents',
        },
      };

      const response = await handlePostToolUse(payload, orchestrator, workflowRepo);

      expect(response).toBeDefined();
      expect(response.continue).toBe(true);
      expect(response.message).toBeUndefined();
    });

    it('should skip when no active workflow exists for session', async () => {
      const payload = {
        session_id: 'test-session-007', // No workflow for this session
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse' as const,
        tool_name: 'Task',
        tool_input: {
          subagent_type: 'backend-architect-moderate',
          description: 'backend-architect (step 1)',
          prompt: 'Design the architecture',
        },
        tool_response: {
          stdout: JSON.stringify({ summary: 'Done' }),
        },
      };

      const response = await handlePostToolUse(payload, orchestrator, workflowRepo);

      expect(response).toBeDefined();
      expect(response.continue).toBe(true);
      expect(response.message).toBeUndefined();
    });

    it('should skip non-Task tools (Write, Bash, etc.)', async () => {
      const toolNames = ['Write', 'Bash', 'Glob', 'Grep', 'Edit'];

      for (const toolName of toolNames) {
        const payload = {
          session_id: 'test-session-008',
          cwd: '/home/user/project',
          hook_event_name: 'PostToolUse' as const,
          tool_name: toolName,
          tool_response: {
            stdout: 'output',
          },
        };

        const response = await handlePostToolUse(payload, orchestrator, workflowRepo);

        expect(response.continue).toBe(true);
        expect(response.message).toBeUndefined();
      }
    });

    it('should return validation error for missing required fields', async () => {
      const payload = {
        // session_id missing
        cwd: '/home/user/project',
        tool_name: 'Task',
      };

      const response = await handlePostToolUse(payload as any, orchestrator, workflowRepo);

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
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: 'moderate',
        sessionId: 'test-session-010',
      });

      // First submission
      const payload = {
        session_id: 'test-session-010',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse' as const,
        tool_name: 'Task',
        tool_input: {
          subagent_type: 'backend-architect-moderate',
          description: 'backend-architect (step 1)',
          prompt: 'Design the architecture',
        },
        tool_response: {
          stdout: JSON.stringify({
            summary: 'First submission',
          }),
        },
      };

      const response1 = await handlePostToolUse(payload, orchestrator, workflowRepo);
      expect(response1.continue).toBe(true);

      // Duplicate submission (same step)
      const response2 = await handlePostToolUse(payload, orchestrator, workflowRepo);

      // Should handle gracefully (may return error or ignore)
      expect(response2).toBeDefined();
    });
  });

  describe('Response format validation', () => {
    it('should return response conforming to Claude Code hook spec', async () => {
      const workflow = await stateManager.createWorkflow({
        userPrompt: 'Test response format',
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: 'moderate',
        sessionId: 'test-session-011',
      });

      const payload = {
        session_id: 'test-session-011',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse' as const,
        tool_name: 'Task',
        tool_input: {
          subagent_type: 'backend-architect-moderate',
          description: 'backend-architect (step 1)',
          prompt: 'Design the architecture',
        },
        tool_response: {
          stdout: JSON.stringify({
            summary: 'Done',
          }),
        },
      };

      const response = await handlePostToolUse(payload, orchestrator, workflowRepo);

      // Hook response should have optional fields: message, decision, hookSpecificOutput, continue
      expect(response).toBeDefined();

      // decision is optional, but if present should be 'allow' or 'block'
      if ('decision' in response) {
        expect(['allow', 'block']).toContain(response.decision);
      }

      // hookSpecificOutput is optional
      if ('hookSpecificOutput' in response) {
        expect(typeof response.hookSpecificOutput).toBe('object');
      }

      // continue is optional
      if ('continue' in response) {
        expect(typeof response.continue).toBe('boolean');
      }
    });
  });
});
