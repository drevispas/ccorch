/**
 * Context Serializer Tests
 *
 * Tests for building context strings from previous agent results
 * to pass to next agent in workflow chain.
 *
 * PRD Reference: §6.2 - "Review previous results: {summary}"
 */

import { describe, it, expect } from 'vitest';
import { AgentResult } from '@prisma/client';
import { buildContextForAgent, extractSummary } from '../../../src/services/context-serializer';

describe('Context Serializer', () => {
  describe('extractSummary()', () => {
    it('should extract summary from valid agent result JSON', () => {
      const agentResult: AgentResult = {
        id: 1,
        workflowId: 'wf-123',
        agentRole: 'backend-architect',
        complexity: 'moderate',
        stepNumber: 0,
        results: JSON.stringify({
          summary: 'Designed REST API with authentication endpoints',
          design: 'API specification with JWT auth',
        }),
        status: 'COMPLETED',
        createdAt: BigInt(Date.now()),
      };

      const summary = extractSummary(agentResult);

      expect(summary).toBe('Designed REST API with authentication endpoints');
    });

    it('should return empty string if summary field is missing', () => {
      const agentResult: AgentResult = {
        id: 2,
        workflowId: 'wf-123',
        agentRole: 'java-backend-developer',
        complexity: 'moderate',
        stepNumber: 1,
        results: JSON.stringify({
          files_modified: ['src/auth.ts'],
        }),
        status: 'COMPLETED',
        createdAt: BigInt(Date.now()),
      };

      const summary = extractSummary(agentResult);

      expect(summary).toBe('');
    });

    it('should handle malformed JSON gracefully', () => {
      const agentResult: AgentResult = {
        id: 3,
        workflowId: 'wf-123',
        agentRole: 'java-backend-developer',
        complexity: 'moderate',
        stepNumber: 1,
        results: 'not valid json {',
        status: 'COMPLETED',
        createdAt: BigInt(Date.now()),
      };

      const summary = extractSummary(agentResult);

      expect(summary).toBe('');
    });

    it('should handle empty results string', () => {
      const agentResult: AgentResult = {
        id: 4,
        workflowId: 'wf-123',
        agentRole: 'code-reviewer',
        complexity: 'simple',
        stepNumber: 2,
        results: '',
        status: 'COMPLETED',
        createdAt: BigInt(Date.now()),
      };

      const summary = extractSummary(agentResult);

      expect(summary).toBe('');
    });

    it('should handle null summary value', () => {
      const agentResult: AgentResult = {
        id: 5,
        workflowId: 'wf-123',
        agentRole: 'backend-architect',
        complexity: 'complex',
        stepNumber: 0,
        results: JSON.stringify({
          summary: null,
          design: 'Some design',
        }),
        status: 'COMPLETED',
        createdAt: BigInt(Date.now()),
      };

      const summary = extractSummary(agentResult);

      expect(summary).toBe('');
    });
  });

  describe('buildContextForAgent()', () => {
    it('should build context string from single agent result', () => {
      const agentResults: AgentResult[] = [
        {
          id: 1,
          workflowId: 'wf-123',
          agentRole: 'backend-architect',
          complexity: 'moderate',
          stepNumber: 0,
          results: JSON.stringify({
            summary: 'Designed REST API with authentication',
          }),
          status: 'COMPLETED',
          createdAt: BigInt(Date.now()),
        },
      ];

      const context = buildContextForAgent(agentResults);

      expect(context).toBe(
        'Previous agent results:\n1. [backend-architect]: Designed REST API with authentication'
      );
    });

    it('should build context string from multiple agent results', () => {
      const agentResults: AgentResult[] = [
        {
          id: 1,
          workflowId: 'wf-123',
          agentRole: 'backend-architect',
          complexity: 'moderate',
          stepNumber: 0,
          results: JSON.stringify({
            summary: 'Designed REST API with authentication',
          }),
          status: 'COMPLETED',
          createdAt: BigInt(Date.now()),
        },
        {
          id: 2,
          workflowId: 'wf-123',
          agentRole: 'java-backend-developer',
          complexity: 'moderate',
          stepNumber: 1,
          results: JSON.stringify({
            summary: 'Implemented authentication endpoints',
          }),
          status: 'COMPLETED',
          createdAt: BigInt(Date.now()) + BigInt(1000),
        },
      ];

      const context = buildContextForAgent(agentResults);

      expect(context).toBe(
        'Previous agent results:\n' +
          '1. [backend-architect]: Designed REST API with authentication\n' +
          '2. [java-backend-developer]: Implemented authentication endpoints'
      );
    });

    it('should return empty string for empty agent results array', () => {
      const agentResults: AgentResult[] = [];

      const context = buildContextForAgent(agentResults);

      expect(context).toBe('');
    });

    it('should skip agent results with missing summaries', () => {
      const agentResults: AgentResult[] = [
        {
          id: 1,
          workflowId: 'wf-123',
          agentRole: 'backend-architect',
          complexity: 'moderate',
          stepNumber: 0,
          results: JSON.stringify({
            summary: 'Designed REST API',
          }),
          status: 'COMPLETED',
          createdAt: BigInt(Date.now()),
        },
        {
          id: 2,
          workflowId: 'wf-123',
          agentRole: 'java-backend-developer',
          complexity: 'moderate',
          stepNumber: 1,
          results: JSON.stringify({
            files_modified: ['auth.ts'],
          }),
          status: 'COMPLETED',
          createdAt: BigInt(Date.now()) + BigInt(1000),
        },
        {
          id: 3,
          workflowId: 'wf-123',
          agentRole: 'code-reviewer',
          complexity: 'moderate',
          stepNumber: 2,
          results: JSON.stringify({
            summary: 'Code review passed',
          }),
          status: 'COMPLETED',
          createdAt: BigInt(Date.now()) + BigInt(2000),
        },
      ];

      const context = buildContextForAgent(agentResults);

      expect(context).toBe(
        'Previous agent results:\n' +
          '1. [backend-architect]: Designed REST API\n' +
          '2. [code-reviewer]: Code review passed'
      );
    });

    it('should handle agent results with malformed JSON', () => {
      const agentResults: AgentResult[] = [
        {
          id: 1,
          workflowId: 'wf-123',
          agentRole: 'backend-architect',
          complexity: 'moderate',
          stepNumber: 0,
          results: 'invalid json',
          status: 'COMPLETED',
          createdAt: BigInt(Date.now()),
        },
        {
          id: 2,
          workflowId: 'wf-123',
          agentRole: 'java-backend-developer',
          complexity: 'moderate',
          stepNumber: 1,
          results: JSON.stringify({
            summary: 'Implemented endpoints',
          }),
          status: 'COMPLETED',
          createdAt: BigInt(Date.now()) + BigInt(1000),
        },
      ];

      const context = buildContextForAgent(agentResults);

      expect(context).toBe('Previous agent results:\n1. [java-backend-developer]: Implemented endpoints');
    });

    it('should maintain agent order based on array order', () => {
      const agentResults: AgentResult[] = [
        {
          id: 3,
          workflowId: 'wf-123',
          agentRole: 'code-reviewer',
          complexity: 'moderate',
          stepNumber: 2,
          results: JSON.stringify({
            summary: 'Third step',
          }),
          status: 'COMPLETED',
          createdAt: BigInt(Date.now()) + BigInt(2000),
        },
        {
          id: 1,
          workflowId: 'wf-123',
          agentRole: 'backend-architect',
          complexity: 'moderate',
          stepNumber: 0,
          results: JSON.stringify({
            summary: 'First step',
          }),
          status: 'COMPLETED',
          createdAt: BigInt(Date.now()),
        },
        {
          id: 2,
          workflowId: 'wf-123',
          agentRole: 'java-backend-developer',
          complexity: 'moderate',
          stepNumber: 1,
          results: JSON.stringify({
            summary: 'Second step',
          }),
          status: 'COMPLETED',
          createdAt: BigInt(Date.now()) + BigInt(1000),
        },
      ];

      const context = buildContextForAgent(agentResults);

      expect(context).toBe(
        'Previous agent results:\n' +
          '1. [code-reviewer]: Third step\n' +
          '2. [backend-architect]: First step\n' +
          '3. [java-backend-developer]: Second step'
      );
    });

    it('should handle agent results with only malformed JSON', () => {
      const agentResults: AgentResult[] = [
        {
          id: 1,
          workflowId: 'wf-123',
          agentRole: 'backend-architect',
          complexity: 'moderate',
          stepNumber: 0,
          results: 'not json',
          status: 'COMPLETED',
          createdAt: BigInt(Date.now()),
        },
      ];

      const context = buildContextForAgent(agentResults);

      expect(context).toBe('');
    });

    it('should handle long summaries correctly', () => {
      const longSummary =
        'Implemented comprehensive authentication system with JWT tokens, refresh tokens, password hashing with bcrypt, rate limiting, and role-based access control (RBAC)';

      const agentResults: AgentResult[] = [
        {
          id: 1,
          workflowId: 'wf-123',
          agentRole: 'java-backend-developer',
          complexity: 'complex',
          stepNumber: 0,
          results: JSON.stringify({
            summary: longSummary,
          }),
          status: 'COMPLETED',
          createdAt: BigInt(Date.now()),
        },
      ];

      const context = buildContextForAgent(agentResults);

      expect(context).toBe(`Previous agent results:\n1. [java-backend-developer]: ${longSummary}`);
    });
  });
});
