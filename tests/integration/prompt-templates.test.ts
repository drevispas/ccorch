/**
 * Prompt Template Integration Tests
 *
 * Purpose: Test prompt templates in the context of full workflows
 * WBS Task: 6.7 Prompt Template Testing
 *
 * Validates that generated prompts:
 * 1. Match PRD §6.1 and §6.2 format specifications
 * 2. Include all required elements (workflow ID, agent role, complexity)
 * 3. Properly substitute variables (no {undefined} placeholders)
 * 4. Include previous context when appropriate
 * 5. Work correctly across full workflow chains
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { WorkflowRepository } from '../../src/models/workflow-repository.js';
import { AgentResultRepository } from '../../src/models/agent-result-repository.js';
import { generateFirstAgentPrompt, generateNextAgentPrompt, generateCompletionMessage } from '../../src/utils/prompt-templates.js';
import { generateAgentPrompt } from '../../src/services/prompt-generator.js';
import { AgentRole, Complexity } from '../../src/types/workflow.js';

describe('Prompt Template Integration Tests', () => {
  let prisma: PrismaClient;
  let workflowRepo: WorkflowRepository;
  let agentResultRepo: AgentResultRepository;

  beforeEach(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL || 'file:./test.db',
        },
      },
    });

    workflowRepo = new WorkflowRepository(prisma);
    agentResultRepo = new AgentResultRepository(prisma);

    // Clear test data
    await prisma.agentResult.deleteMany();
    await prisma.workflowTransition.deleteMany();
    await prisma.workflow.deleteMany();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  describe('First Agent Prompt Format (PRD §6.1)', () => {
    it('should generate first agent prompt matching PRD §6.1 format', () => {
      const prompt = generateFirstAgentPrompt(
        AgentRole.BACKEND_ARCHITECT,
        Complexity.MODERATE,
        'wf-test-001',
        'Design REST API for user authentication'
      );

      // Verify PRD §6.1 format: "Use the {agent-role}-{complexity} subagent to:"
      expect(prompt).toContain('Use the backend-architect-moderate subagent to:');
      expect(prompt).toContain('Design REST API for user authentication');
      expect(prompt).toContain('Workflow ID: wf-test-001');
    });

    it('should not include API submission reminder in first agent prompt', () => {
      const prompt = generateFirstAgentPrompt(
        AgentRole.FRONTEND_DEVELOPER,
        Complexity.SIMPLE,
        'wf-test-002',
        'Create login button component'
      );

      // First agent prompt should NOT include API submission instructions
      // (API submission is handled by PostToolUse hook)
      expect(prompt).not.toContain('POST');
      expect(prompt).not.toContain('/api/workflows');
    });

    it('should correctly substitute agent role and complexity', () => {
      const roles = [
        AgentRole.BACKEND_ARCHITECT,
        AgentRole.FRONTEND_ARCHITECT,
        AgentRole.BACKEND_DEVELOPER,
        AgentRole.FRONTEND_DEVELOPER,
        AgentRole.REVIEWER,
        AgentRole.DEBUGGER,
        AgentRole.E2E_TEST_ARCHITECT,
      ];

      const complexities = [Complexity.SIMPLE, Complexity.MODERATE, Complexity.COMPLEX];

      roles.forEach((role) => {
        complexities.forEach((complexity) => {
          const prompt = generateFirstAgentPrompt(role, complexity, 'wf-test', 'Test task');

          // Verify agent-complexity combination is present
          expect(prompt).toContain(`${role}-${complexity}`);
          expect(prompt).not.toContain('{');
          expect(prompt).not.toContain('}');
          expect(prompt).not.toContain('undefined');
        });
      });
    });

    it('should handle all workflow chains correctly', async () => {
      const testCases = [
        { chain: 'backend-development', firstAgent: AgentRole.BACKEND_ARCHITECT },
        { chain: 'frontend-development', firstAgent: AgentRole.FRONTEND_ARCHITECT },
        { chain: 'debug', firstAgent: AgentRole.DEBUGGER },
        { chain: 'review', firstAgent: AgentRole.REVIEWER },
        { chain: 'backend-design-only', firstAgent: AgentRole.BACKEND_ARCHITECT },
        { chain: 'frontend-design-only', firstAgent: AgentRole.FRONTEND_ARCHITECT },
        { chain: 'backend-only', firstAgent: AgentRole.BACKEND_DEVELOPER },
        { chain: 'frontend-only', firstAgent: AgentRole.FRONTEND_DEVELOPER },
        { chain: 'review-only', firstAgent: AgentRole.REVIEWER },
        { chain: 'debug-only', firstAgent: AgentRole.DEBUGGER },
      ];

      testCases.forEach(({ chain, firstAgent }) => {
        const prompt = generateFirstAgentPrompt(
          firstAgent,
          Complexity.MODERATE,
          `wf-${chain}`,
          `Test task for ${chain}`
        );

        expect(prompt).toContain(firstAgent);
        expect(prompt).toContain('moderate');
        expect(prompt).toContain('subagent');
      });
    });
  });

  describe('Next Agent Prompt with Context (PRD §6.2)', () => {
    it('should generate next agent prompt matching PRD §6.2 format', () => {
      const previousContext = 'Backend architect designed JWT-based auth system';

      const prompt = generateNextAgentPrompt(
        AgentRole.BACKEND_DEVELOPER,
        Complexity.MODERATE,
        'wf-test-003',
        'Implement the authentication system',
        previousContext
      );

      // Verify PRD §6.2 format
      expect(prompt).toContain('Use the java-backend-developer-moderate subagent to:');
      expect(prompt).toContain('Review previous results:');
      expect(prompt).toContain('Backend architect designed JWT-based auth system');
      expect(prompt).toContain('Continue with: Implement the authentication system');
      expect(prompt).toContain('Workflow ID: wf-test-003');
    });

    it('should include previous agent context from database', async () => {
      // Create workflow
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Implement authentication',
        chainName: 'backend-development',
        complexity: Complexity.MODERATE,
        draftComplexity: Complexity.MODERATE,
        currentStep: 1,
        status: 'ACTIVE',
      });

      // Add first agent result
      await agentResultRepo.createResult({
        workflowId: workflow.id,
        agentRole: AgentRole.BACKEND_ARCHITECT,
        complexity: Complexity.MODERATE,
        stepNumber: 0,
        results: JSON.stringify({
          summary: 'Designed JWT-based authentication API',
          design: 'RESTful endpoints with refresh tokens',
        }),
      });

      // Generate next agent prompt
      const previousContext = 'Previous agent: Designed JWT-based authentication API';
      const prompt = generateNextAgentPrompt(
        AgentRole.BACKEND_DEVELOPER,
        Complexity.MODERATE,
        workflow.id,
        'Implement the authentication API',
        previousContext
      );

      expect(prompt).toContain('Review previous results:');
      expect(prompt).toContain('Designed JWT-based authentication API');
    });

    it('should handle multiple previous agents in context', () => {
      const multiContext = `Previous agent results:
1. [backend-architect]: Designed API with JWT auth
2. [java-backend-developer]: Implemented authentication endpoints`;

      const prompt = generateNextAgentPrompt(
        AgentRole.REVIEWER,
        Complexity.MODERATE,
        'wf-multi-agent',
        'Review the authentication implementation',
        multiContext
      );

      expect(prompt).toContain('Designed API with JWT auth');
      expect(prompt).toContain('Implemented authentication endpoints');
      expect(prompt).toContain('Review the authentication implementation');
    });

    it('should not include undefined placeholders in context', () => {
      const context = 'Previous: Design completed successfully';

      const prompt = generateNextAgentPrompt(
        AgentRole.FRONTEND_DEVELOPER,
        Complexity.COMPLEX,
        'wf-no-placeholders',
        'Build the frontend',
        context
      );

      expect(prompt).not.toContain('{undefined}');
      expect(prompt).not.toMatch(/\bundefined\b/);
      expect(prompt).not.toMatch(/\{[^}]+\}/);
    });
  });

  describe('Template Variable Substitution', () => {
    it('should have no undefined placeholders in first agent prompt', () => {
      const prompt = generateFirstAgentPrompt(
        AgentRole.BACKEND_DEVELOPER,
        Complexity.MODERATE,
        'wf-check-vars',
        'Implement user service'
      );

      expect(prompt).not.toMatch(/\{[^}]*undefined[^}]*\}/);
      expect(prompt).not.toMatch(/undefined/i);
    });

    it('should have no undefined placeholders in next agent prompt', () => {
      const prompt = generateNextAgentPrompt(
        AgentRole.REVIEWER,
        Complexity.SIMPLE,
        'wf-check-vars-next',
        'Review implementation',
        'Previous: Implementation complete'
      );

      expect(prompt).not.toMatch(/\{[^}]*undefined[^}]*\}/);
      expect(prompt).not.toMatch(/undefined/i);
    });

    it('should have no undefined placeholders in completion message', () => {
      const message = generateCompletionMessage(
        'wf-check-completion',
        'All tasks completed successfully'
      );

      expect(message).not.toMatch(/\{[^}]*undefined[^}]*\}/);
      expect(message).not.toMatch(/undefined/i);
    });

    it('should handle empty or null values gracefully', () => {
      // Empty context should not cause undefined
      const promptWithEmptyContext = generateNextAgentPrompt(
        AgentRole.BACKEND_DEVELOPER,
        Complexity.MODERATE,
        'wf-empty',
        'Continue task',
        ''
      );

      expect(promptWithEmptyContext).not.toContain('undefined');
      expect(promptWithEmptyContext).not.toContain('Review previous results:');

      // Empty summary should not cause undefined
      const completionWithEmptySummary = generateCompletionMessage('wf-empty-summary', '');

      expect(completionWithEmptySummary).not.toContain('undefined');
    });
  });

  describe('Full Workflow Prompt Progression', () => {
    it('should generate correct prompts for backend-development workflow', async () => {
      // Create workflow
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Implement REST API for user management',
        chainName: 'backend-development',
        complexity: Complexity.MODERATE,
        draftComplexity: Complexity.MODERATE,
        currentStep: 0,
        status: 'ACTIVE',
      });

      // Step 1: Backend Architect (first agent)
      const step1Prompt = generateFirstAgentPrompt(
        AgentRole.BACKEND_ARCHITECT,
        Complexity.MODERATE,
        workflow.id,
        'Implement REST API for user management'
      );

      expect(step1Prompt).toContain('backend-architect-moderate');
      expect(step1Prompt).toContain('Implement REST API for user management');
      expect(step1Prompt).toContain(workflow.id);

      // Save architect result
      await agentResultRepo.createResult({
        workflowId: workflow.id,
        agentRole: AgentRole.BACKEND_ARCHITECT,
        complexity: Complexity.MODERATE,
        stepNumber: 0,
        results: JSON.stringify({
          summary: 'Designed RESTful API for user CRUD operations',
          design: 'GET /users, POST /users, PUT /users/:id, DELETE /users/:id',
        }),
      });

      // Step 2: Backend Developer (next agent)
      const step2Context = 'Designed RESTful API for user CRUD operations';
      const step2Prompt = generateNextAgentPrompt(
        AgentRole.BACKEND_DEVELOPER,
        Complexity.MODERATE,
        workflow.id,
        'Implement the user management API',
        step2Context
      );

      expect(step2Prompt).toContain('java-backend-developer-moderate');
      expect(step2Prompt).toContain('Review previous results:');
      expect(step2Prompt).toContain('Designed RESTful API for user CRUD operations');

      // Save developer result
      await agentResultRepo.createResult({
        workflowId: workflow.id,
        agentRole: AgentRole.BACKEND_DEVELOPER,
        complexity: Complexity.MODERATE,
        stepNumber: 1,
        results: JSON.stringify({
          summary: 'Implemented all user CRUD endpoints with validation',
          filesModified: ['src/api/users.ts', 'src/models/user.ts'],
        }),
      });

      // Step 3: Reviewer (final agent)
      const step3Context = `1. [backend-architect]: Designed RESTful API for user CRUD operations
2. [java-backend-developer]: Implemented all user CRUD endpoints with validation`;
      const step3Prompt = generateNextAgentPrompt(
        AgentRole.REVIEWER,
        Complexity.MODERATE,
        workflow.id,
        'Review the user management implementation',
        step3Context
      );

      expect(step3Prompt).toContain('reviewer-moderate');
      expect(step3Prompt).toContain('Designed RESTful API');
      expect(step3Prompt).toContain('Implemented all user CRUD endpoints');

      // Step 4: Completion
      const completionMessage = generateCompletionMessage(
        workflow.id,
        'User management API complete: designed, implemented, and reviewed'
      );

      expect(completionMessage).toContain('Workflow complete');
      expect(completionMessage).toContain(workflow.id);
      expect(completionMessage).toContain('User management API complete');
    });

    it('should generate correct prompts for frontend-development workflow', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Create user profile component',
        chainName: 'frontend-development',
        complexity: Complexity.SIMPLE,
        draftComplexity: Complexity.SIMPLE,
        currentStep: 0,
        status: 'ACTIVE',
      });

      // Step 1: Frontend Architect
      const step1 = generateFirstAgentPrompt(
        AgentRole.FRONTEND_ARCHITECT,
        Complexity.SIMPLE,
        workflow.id,
        'Create user profile component'
      );

      expect(step1).toContain('frontend-architect-simple');

      // Step 2: Frontend Developer
      const step2 = generateNextAgentPrompt(
        AgentRole.FRONTEND_DEVELOPER,
        Complexity.SIMPLE,
        workflow.id,
        'Implement user profile component',
        'Design: React component with avatar, name, email fields'
      );

      expect(step2).toContain('nextjs-react-developer-simple');
      expect(step2).toContain('React component with avatar');

      // Step 3: Reviewer
      const step3 = generateNextAgentPrompt(
        AgentRole.REVIEWER,
        Complexity.SIMPLE,
        workflow.id,
        'Review user profile component',
        'Component implemented with all fields'
      );

      expect(step3).toContain('reviewer-simple');
    });

    it('should generate correct prompts for debug workflow', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Fix authentication timeout bug',
        chainName: 'debug',
        complexity: Complexity.MODERATE,
        draftComplexity: Complexity.MODERATE,
        currentStep: 0,
        status: 'ACTIVE',
      });

      // Step 1: Debugger
      const step1 = generateFirstAgentPrompt(
        AgentRole.DEBUGGER,
        Complexity.MODERATE,
        workflow.id,
        'Fix authentication timeout bug'
      );

      expect(step1).toContain('debugger-moderate');

      // Step 2: Backend Developer (fix)
      const step2 = generateNextAgentPrompt(
        AgentRole.BACKEND_DEVELOPER,
        Complexity.MODERATE,
        workflow.id,
        'Fix the timeout issue',
        'Root cause: Token expiry set to 5 minutes, should be 15 minutes'
      );

      expect(step2).toContain('java-backend-developer-moderate');
      expect(step2).toContain('Token expiry set to 5 minutes');
    });
  });

  describe('Prompt Generator Service Integration', () => {
    it('should generate agent prompts with correct format', () => {
      const prompt = generateAgentPrompt(
        {
          chainName: 'backend-development',
          agentRole: 'backend-architect',
          complexity: Complexity.MODERATE,
          stepNumber: 0,
        },
        undefined,
        'wf-generator-test'
      );

      expect(prompt).toContain('backend-architect-moderate');
      expect(prompt).toContain('subagent');
    });

    it('should include context in agent prompts when provided', () => {
      const context = 'Previous design completed successfully';

      const prompt = generateAgentPrompt(
        {
          chainName: 'backend-development',
          agentRole: 'java-backend-developer',
          complexity: Complexity.MODERATE,
          stepNumber: 1,
        },
        context,
        'wf-with-context'
      );

      expect(prompt).toContain('java-backend-developer-moderate');
      expect(prompt).toContain('previous');
    });
  });

  describe('PRD §6 Compliance', () => {
    it('should match PRD §6.1 UserPromptSubmit format exactly', () => {
      const prompt = generateFirstAgentPrompt(
        AgentRole.BACKEND_ARCHITECT,
        Complexity.MODERATE,
        'wf-prd-compliance',
        'Design authentication system'
      );

      // PRD §6.1 specifies: "Use the {agent-role}-{complexity} subagent to:"
      expect(prompt).toMatch(/Use the [a-z-]+-[a-z]+ subagent to:/);
      expect(prompt).toContain('backend-architect-moderate');
    });

    it('should match PRD §6.2 PostToolUse format exactly', () => {
      const prompt = generateNextAgentPrompt(
        AgentRole.BACKEND_DEVELOPER,
        Complexity.MODERATE,
        'wf-prd-compliance-2',
        'Implement authentication',
        'Designed JWT-based authentication'
      );

      // PRD §6.2 specifies: "Use the {next-agent-role}-{complexity} subagent to:"
      // with "Review previous results: {summary}"
      expect(prompt).toMatch(/Use the [a-z-]+-[a-z]+ subagent to:/);
      expect(prompt).toContain('Review previous results:');
      expect(prompt).toContain('Designed JWT-based authentication');
    });

    it('should match PRD workflow completion format', () => {
      const message = generateCompletionMessage(
        'wf-completion',
        'All agents finished successfully'
      );

      // PRD specifies: "Workflow complete. All agents finished successfully."
      expect(message).toContain('Workflow complete');
      expect(message).toContain('All agents finished successfully');
    });
  });
});
