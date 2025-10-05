/**
 * Prompt Templates Tests
 *
 * Tests for prompt template generation functions that format
 * messages for agent handoffs in workflow chains.
 *
 * PRD Reference: §6.1 (UserPromptSubmit), §6.2 (PostToolUse)
 */

import { describe, it, expect } from 'vitest';
import {
  generateFirstAgentPrompt,
  generateNextAgentPrompt,
  generateCompletionMessage,
} from '../../../src/utils/prompt-templates';
import { AgentRole, Complexity } from '../../../src/types/workflow';

describe('Prompt Templates', () => {
  describe('generateFirstAgentPrompt()', () => {
    it('should generate first agent prompt with correct format per PRD §6.1', () => {
      const prompt = generateFirstAgentPrompt(
        AgentRole.BACKEND_ARCHITECT,
        Complexity.MODERATE,
        'wf-123',
        'Design REST API for authentication'
      );

      expect(prompt).toContain('Use the backend-architect-moderate subagent to:');
      expect(prompt).toContain('Design REST API for authentication');
    });

    it('should include workflow ID in prompt', () => {
      const prompt = generateFirstAgentPrompt(
        AgentRole.FRONTEND_DEVELOPER,
        Complexity.SIMPLE,
        'wf-456',
        'Create login button'
      );

      expect(prompt).toContain('wf-456');
    });

    it('should handle complex agent roles', () => {
      const prompt = generateFirstAgentPrompt(
        AgentRole.E2E_TEST_ARCHITECT,
        Complexity.COMPLEX,
        'wf-789',
        'Design comprehensive test strategy'
      );

      expect(prompt).toContain('e2e-test-architect-complex');
    });

    it('should format different complexity levels correctly', () => {
      const simplePrompt = generateFirstAgentPrompt(
        AgentRole.REVIEWER,
        Complexity.SIMPLE,
        'wf-1',
        'Review code'
      );

      const complexPrompt = generateFirstAgentPrompt(
        AgentRole.BACKEND_DEVELOPER,
        Complexity.COMPLEX,
        'wf-2',
        'Build microservices'
      );

      expect(simplePrompt).toContain('reviewer-simple');
      expect(complexPrompt).toContain('backend-developer-complex');
    });

    it('should not have undefined placeholders', () => {
      const prompt = generateFirstAgentPrompt(
        AgentRole.DEBUGGER,
        Complexity.MODERATE,
        'wf-test',
        'Debug authentication issue'
      );

      expect(prompt).not.toContain('{undefined}');
      expect(prompt).not.toContain('undefined');
    });

    it('should handle multi-line user prompts', () => {
      const userPrompt = 'Implement authentication\nInclude JWT tokens\nAdd refresh logic';
      const prompt = generateFirstAgentPrompt(
        AgentRole.BACKEND_DEVELOPER,
        Complexity.MODERATE,
        'wf-multi',
        userPrompt
      );

      expect(prompt).toContain('Implement authentication');
      expect(prompt).toContain('Include JWT tokens');
      expect(prompt).toContain('Add refresh logic');
    });
  });

  describe('generateNextAgentPrompt()', () => {
    it('should generate next agent prompt with previous context per PRD §6.2', () => {
      const previousContext =
        'Previous agent results:\n1. [backend-architect]: Designed API with JWT auth';

      const prompt = generateNextAgentPrompt(
        AgentRole.BACKEND_DEVELOPER,
        Complexity.MODERATE,
        'wf-123',
        'Implement the designed API',
        previousContext
      );

      expect(prompt).toContain('Use the backend-developer-moderate subagent to:');
      expect(prompt).toContain('Review previous results:');
      expect(prompt).toContain('Designed API with JWT auth');
      expect(prompt).toContain('Implement the designed API');
    });

    it('should include workflow ID in next agent prompt', () => {
      const prompt = generateNextAgentPrompt(
        AgentRole.REVIEWER,
        Complexity.SIMPLE,
        'wf-review-123',
        'Review the implementation',
        'Previous results: Implementation complete'
      );

      expect(prompt).toContain('wf-review-123');
    });

    it('should handle empty previous context gracefully', () => {
      const prompt = generateNextAgentPrompt(
        AgentRole.BACKEND_DEVELOPER,
        Complexity.MODERATE,
        'wf-no-context',
        'Continue implementation',
        ''
      );

      expect(prompt).toContain('backend-developer-moderate');
      expect(prompt).toContain('Continue implementation');
      expect(prompt).not.toContain('Review previous results:');
    });

    it('should format context and task separately', () => {
      const context =
        'Previous agent results:\n1. [architect]: Design complete\n2. [developer]: Implementation done';
      const prompt = generateNextAgentPrompt(
        AgentRole.REVIEWER,
        Complexity.COMPLEX,
        'wf-sep',
        'Review all changes',
        context
      );

      expect(prompt).toContain('Design complete');
      expect(prompt).toContain('Implementation done');
      expect(prompt).toContain('Review all changes');
    });

    it('should not have undefined placeholders', () => {
      const prompt = generateNextAgentPrompt(
        AgentRole.FRONTEND_DEVELOPER,
        Complexity.SIMPLE,
        'wf-test',
        'Build component',
        'Previous: Design ready'
      );

      expect(prompt).not.toContain('{undefined}');
      expect(prompt).not.toContain('undefined');
    });

    it('should handle multi-line tasks with context', () => {
      const context = 'Previous: API designed';
      const task = 'Implement endpoints\nAdd validation\nWrite tests';

      const prompt = generateNextAgentPrompt(
        AgentRole.BACKEND_DEVELOPER,
        Complexity.MODERATE,
        'wf-multi',
        task,
        context
      );

      expect(prompt).toContain('API designed');
      expect(prompt).toContain('Implement endpoints');
      expect(prompt).toContain('Add validation');
      expect(prompt).toContain('Write tests');
    });
  });

  describe('generateCompletionMessage()', () => {
    it('should generate completion message with workflow summary', () => {
      const message = generateCompletionMessage(
        'wf-complete',
        'Successfully implemented authentication API with all tests passing'
      );

      expect(message).toContain('Workflow complete');
      expect(message).toContain('wf-complete');
      expect(message).toContain('Successfully implemented authentication API');
    });

    it('should handle completion without summary', () => {
      const message = generateCompletionMessage('wf-done', '');

      expect(message).toContain('Workflow complete');
      expect(message).toContain('wf-done');
    });

    it('should include success indicator', () => {
      const message = generateCompletionMessage(
        'wf-success',
        'All agents finished successfully'
      );

      expect(message).toContain('successfully');
      expect(message).toContain('All agents finished successfully');
    });

    it('should format multi-line summaries', () => {
      const summary =
        'Architecture designed\nImplementation complete\nTests passing\nCode reviewed';

      const message = generateCompletionMessage('wf-multi', summary);

      expect(message).toContain('Architecture designed');
      expect(message).toContain('Implementation complete');
      expect(message).toContain('Tests passing');
      expect(message).toContain('Code reviewed');
    });

    it('should not have undefined placeholders', () => {
      const message = generateCompletionMessage('wf-test', 'Task completed');

      expect(message).not.toContain('{undefined}');
      expect(message).not.toContain('undefined');
    });
  });

  describe('Template Integration', () => {
    it('should maintain consistent format across all templates', () => {
      const firstPrompt = generateFirstAgentPrompt(
        AgentRole.BACKEND_ARCHITECT,
        Complexity.MODERATE,
        'wf-123',
        'Design API'
      );

      const nextPrompt = generateNextAgentPrompt(
        AgentRole.BACKEND_DEVELOPER,
        Complexity.MODERATE,
        'wf-123',
        'Implement API',
        'Previous: Design complete'
      );

      const completion = generateCompletionMessage('wf-123', 'API complete');

      // All should reference the same workflow ID
      expect(firstPrompt).toContain('wf-123');
      expect(nextPrompt).toContain('wf-123');
      expect(completion).toContain('wf-123');

      // All should use proper formatting
      expect(firstPrompt).toContain('subagent');
      expect(nextPrompt).toContain('subagent');
      expect(completion).toContain('Workflow');
    });

    it('should handle full workflow prompt sequence', () => {
      const workflowId = 'wf-full-test';

      // Step 1: First agent
      const step1 = generateFirstAgentPrompt(
        AgentRole.BACKEND_ARCHITECT,
        Complexity.MODERATE,
        workflowId,
        'Design authentication system'
      );

      // Step 2: Next agent with context
      const context1 =
        'Previous agent results:\n1. [backend-architect]: Designed JWT-based auth';
      const step2 = generateNextAgentPrompt(
        AgentRole.BACKEND_DEVELOPER,
        Complexity.MODERATE,
        workflowId,
        'Implement the authentication system',
        context1
      );

      // Step 3: Final agent with accumulated context
      const context2 =
        'Previous agent results:\n1. [backend-architect]: Designed JWT-based auth\n2. [backend-developer]: Implemented auth endpoints';
      const step3 = generateNextAgentPrompt(
        AgentRole.REVIEWER,
        Complexity.MODERATE,
        workflowId,
        'Review authentication implementation',
        context2
      );

      // Step 4: Completion
      const completion = generateCompletionMessage(
        workflowId,
        'Authentication system complete with review approved'
      );

      // Verify progression
      expect(step1).toContain('backend-architect-moderate');
      expect(step2).toContain('backend-developer-moderate');
      expect(step2).toContain('Designed JWT-based auth');
      expect(step3).toContain('reviewer-moderate');
      expect(step3).toContain('Implemented auth endpoints');
      expect(completion).toContain('Authentication system complete');
    });
  });
});
