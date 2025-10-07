/**
 * Unit Tests: Prompt Generator Service
 *
 * Tests the prompt generation functions for:
 * - Complexity analysis prompts (asking CC to determine complexity)
 * - Agent injection prompts (instructing CC to use subagents)
 * - Completion messages (workflow summaries)
 */

import { describe, it, expect } from 'vitest';
import {
  generateComplexityAnalysisPrompt,
  generateAgentPrompt,
  generateCompletionMessage,
} from '../../../src/services/prompt-generator.js';

describe('Prompt Generator Service', () => {
  describe('generateComplexityAnalysisPrompt', () => {
    it('should include user prompt in analysis request', () => {
      const userPrompt = 'Implement REST API for authentication';
      const prompt = generateComplexityAnalysisPrompt(
        userPrompt,
        'moderate',
        'wf-123',
        'http://localhost:3000',
      );

      expect(prompt).toContain(userPrompt);
      expect(prompt).toContain('**Task**');
    });

    it('should include draft complexity as reference', () => {
      const prompt = generateComplexityAnalysisPrompt(
        'Add validation',
        'simple',
        'wf-123',
        'http://localhost:3000',
      );

      expect(prompt).toContain('simple');
      expect(prompt).toContain('**Draft Complexity**');
    });

    it('should include all three complexity guidelines', () => {
      const prompt = generateComplexityAnalysisPrompt(
        'Refactor system',
        'complex',
        'wf-123',
        'http://localhost:3000',
      );

      expect(prompt).toContain('**simple**');
      expect(prompt).toContain('**moderate**');
      expect(prompt).toContain('**complex**');
      expect(prompt).toContain('Complexity Guidelines');
    });

    it('should include API endpoint URL with workflow ID', () => {
      const workflowId = 'wf-abc-123';
      const apiBaseUrl = 'http://localhost:3000';
      const prompt = generateComplexityAnalysisPrompt(
        'Build feature',
        'moderate',
        workflowId,
        apiBaseUrl,
      );

      expect(prompt).toContain(`${apiBaseUrl}/api/workflows/${workflowId}/set-complexity`);
      expect(prompt).toContain('POST');
    });

    it('should include request body format with complexity and reasoning fields', () => {
      const prompt = generateComplexityAnalysisPrompt(
        'Fix bug',
        'simple',
        'wf-123',
        'http://localhost:3000',
      );

      expect(prompt).toContain('"complexity"');
      expect(prompt).toContain('"reasoning"');
      expect(prompt).toContain('json');
    });

    it('should instruct CC to read API response and execute nextInstructions', () => {
      const prompt = generateComplexityAnalysisPrompt(
        'Task',
        'moderate',
        'wf-123',
        'http://localhost:3000',
      );

      expect(prompt).toContain('nextInstructions');
      expect(prompt).toContain('execute');
      expect(prompt.toLowerCase()).toContain('important');
    });
  });

  describe('generateAgentPrompt', () => {
    it('should include agent name with complexity level', () => {
      const prompt = generateAgentPrompt({
        chainName: 'backend-development',
        agentRole: 'backend-architect',
        complexity: 'moderate',
        stepNumber: 0,
      });

      expect(prompt).toContain('backend-architect-moderate');
    });

    it('should include context from previous agent when provided', () => {
      const previousContext = 'Designed JWT authentication system';
      const prompt = generateAgentPrompt(
        {
          chainName: 'backend-development',
          agentRole: 'java-backend-developer',
          complexity: 'moderate',
          stepNumber: 1,
        },
        previousContext,
      );

      expect(prompt).toContain(previousContext);
      expect(prompt).toContain('Review previous');
    });

    it('should omit context section when no previous agent results', () => {
      const prompt = generateAgentPrompt({
        chainName: 'backend-development',
        agentRole: 'backend-architect',
        complexity: 'simple',
        stepNumber: 0,
      });

      expect(prompt).not.toContain('Review previous');
      expect(prompt).toContain('Begin the workflow');
    });

    it('should generate architect-specific tasks (design only, no implementation)', () => {
      const prompt = generateAgentPrompt({
        chainName: 'backend-development',
        agentRole: 'backend-architect',
        complexity: 'complex',
        stepNumber: 0,
      });

      expect(prompt).toContain('design');
      expect(prompt.toLowerCase()).toContain('do not implement');
      expect(prompt).toContain('architecture');
    });

    it('should generate backend-developer-specific tasks', () => {
      const prompt = generateAgentPrompt({
        chainName: 'backend-development',
        agentRole: 'java-backend-developer',
        complexity: 'moderate',
        stepNumber: 1,
      });

      expect(prompt).toContain('Implement');
      expect(prompt).toContain('backend');
      expect(prompt).toContain('tests');
      expect(prompt).toContain('error handling');
    });

    it('should generate frontend-developer-specific tasks', () => {
      const prompt = generateAgentPrompt({
        chainName: 'frontend-development',
        agentRole: 'nextjs-react-developer',
        complexity: 'moderate',
        stepNumber: 1,
      });

      expect(prompt).toContain('frontend');
      expect(prompt).toContain('UI');
      expect(prompt).toContain('responsive');
      expect(prompt).toContain('accessibility');
    });

    it('should generate reviewer-specific tasks', () => {
      const prompt = generateAgentPrompt({
        chainName: 'backend-development',
        agentRole: 'code-reviewer',
        complexity: 'moderate',
        stepNumber: 2,
      });

      expect(prompt).toContain('Review');
      expect(prompt).toContain('staged and unstaged');
      expect(prompt).toContain('code quality');
      expect(prompt).toContain('security');
    });

    it('should generate debugger-specific tasks', () => {
      const prompt = generateAgentPrompt({
        chainName: 'debug',
        agentRole: 'issue-detective',
        complexity: 'moderate',
        stepNumber: 0,
      });

      expect(prompt).toContain('Investigate');
      expect(prompt).toContain('root cause');
      expect(prompt).toContain('findings');
    });

    it('should format tasks as numbered list', () => {
      const prompt = generateAgentPrompt({
        chainName: 'backend-development',
        agentRole: 'java-backend-developer',
        complexity: 'simple',
        stepNumber: 1,
      });

      expect(prompt).toMatch(/1\./);
      expect(prompt).toMatch(/2\./);
      expect(prompt).toContain('**Tasks to complete**:');
    });

    it('should handle all complexity levels consistently', () => {
      const complexities: Array<'simple' | 'moderate' | 'complex'> = [
        'simple',
        'moderate',
        'complex',
      ];

      complexities.forEach((complexity) => {
        const prompt = generateAgentPrompt({
          chainName: 'backend-development',
          agentRole: 'java-backend-developer',
          complexity,
          stepNumber: 1,
        });

        expect(prompt).toContain(`java-backend-developer-${complexity}`);
        expect(prompt).toContain('Tasks');
      });
    });
  });

  describe('generateCompletionMessage', () => {
    it('should include chain name in completion message', () => {
      const message = generateCompletionMessage('backend-development', [
        'Designed architecture',
        'Implemented API',
        'Reviewed code',
      ]);

      expect(message).toContain('backend-development');
      expect(message).toContain('Complete');
    });

    it('should format agent summaries as numbered list', () => {
      const summaries = ['Task 1 completed', 'Task 2 completed', 'Task 3 completed'];
      const message = generateCompletionMessage('frontend-development', summaries);

      expect(message).toMatch(/1\./);
      expect(message).toMatch(/2\./);
      expect(message).toMatch(/3\./);
      summaries.forEach((summary) => {
        expect(message).toContain(summary);
      });
    });

    it('should indicate successful completion', () => {
      const message = generateCompletionMessage('review', ['Code reviewed and approved']);

      expect(message.toLowerCase()).toContain('complete');
      expect(message.toLowerCase()).toContain('success');
    });

    it('should handle single agent workflow', () => {
      const message = generateCompletionMessage('debug-only', ['Root cause identified']);

      expect(message).toContain('Root cause identified');
      expect(message).toContain('1.');
    });

    it('should handle multi-agent workflow (3+ agents)', () => {
      const summaries = [
        'Architecture designed',
        'Backend implemented',
        'Tests written',
        'Code reviewed',
      ];
      const message = generateCompletionMessage('backend-development', summaries);

      summaries.forEach((summary, index) => {
        expect(message).toContain(`${index + 1}.`);
        expect(message).toContain(summary);
      });
    });
  });
});
