/**
 * Orchestrator Coordinator Tests
 *
 * Tests for the main orchestration logic that coordinates all workflow services
 * and generates prompts for agent handoffs.
 *
 * PRD Reference: §6.1 (UserPromptSubmit), §6.2 (PostToolUse)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Orchestrator } from '../../../src/services/orchestrator';
import { parseIntent } from '../../../src/services/prompt-parser';
import { analyzeComplexity } from '../../../src/services/complexity-analyzer';
import { resolveChain } from '../../../src/services/chain-resolver';
import { StateManager } from '../../../src/services/state-manager';
import { buildContextForAgent } from '../../../src/services/context-serializer';
import type {
  IWorkflowRepository,
  ITransitionRepository,
  IAgentResultRepository,
} from '../../../src/types/repositories';
import { ChainName, AgentRole, Complexity } from '../../../src/types/workflow';
import type { Workflow, AgentResult } from '@prisma/client';

// Mock all service modules
vi.mock('../../../src/services/prompt-parser');
vi.mock('../../../src/services/complexity-analyzer');
vi.mock('../../../src/services/chain-resolver');
vi.mock('../../../src/services/context-serializer');

describe('Orchestrator Coordinator', () => {
  let orchestrator: Orchestrator;
  let mockWorkflowRepo: IWorkflowRepository;
  let mockTransitionRepo: ITransitionRepository;
  let mockAgentResultRepo: IAgentResultRepository;
  let mockStateManager: StateManager;

  beforeEach(() => {
    // Create mock repositories
    mockWorkflowRepo = {
      createWorkflow: vi.fn(),
      findById: vi.fn(),
      findByStatus: vi.fn(),
      findActive: vi.fn(),
      updateStatus: vi.fn(),
      updateCurrentStep: vi.fn(),
      updateComplexity: vi.fn(),
      deleteWorkflow: vi.fn(),
    };

    mockTransitionRepo = {
      createTransition: vi.fn(),
      findByWorkflowId: vi.fn(),
      findLatest: vi.fn(),
    };

    mockAgentResultRepo = {
      createResult: vi.fn(),
      findByWorkflowId: vi.fn(),
      findByWorkflowIdAndStep: vi.fn(),
    };

    // Create state manager with mocked repos
    mockStateManager = new StateManager(
      mockWorkflowRepo,
      mockTransitionRepo
    );

    // Create orchestrator
    orchestrator = new Orchestrator(mockStateManager, mockAgentResultRepo);
  });

  describe('handleUserPrompt()', () => {
    it('should parse intent, resolve chain, create workflow, and return first agent prompt', async () => {
      const userPrompt = 'Implement REST API for user authentication';

      // Mock prompt parser
      vi.mocked(parseIntent).mockReturnValue({
        roles: [AgentRole.BACKEND_DEVELOPER],
        keywords: ['api', 'authentication', 'implement'],
      });

      // Mock complexity analyzer
      vi.mocked(analyzeComplexity).mockReturnValue(Complexity.MODERATE);

      // Mock chain resolver
      vi.mocked(resolveChain).mockReturnValue({
        chainName: ChainName.BACKEND_DEVELOPMENT,
        agentSequence: [
          AgentRole.BACKEND_ARCHITECT,
          AgentRole.BACKEND_DEVELOPER,
          AgentRole.REVIEWER,
        ],
      });

      // Mock state manager createWorkflow
      const mockWorkflow: Workflow = {
        id: 'wf-123',
        userPrompt,
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: 'moderate',
        draftComplexity: null,
        currentStep: 0,
        status: 'ACTIVE',
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
      };
      vi.spyOn(mockStateManager, 'createWorkflow').mockResolvedValue(mockWorkflow);

      // Execute
      const result = await orchestrator.handleUserPrompt(userPrompt);

      // Verify
      expect(parseIntent).toHaveBeenCalledWith(userPrompt);
      expect(analyzeComplexity).toHaveBeenCalled();
      expect(resolveChain).toHaveBeenCalled();
      expect(mockStateManager.createWorkflow).toHaveBeenCalledWith({
        userPrompt,
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: Complexity.MODERATE,
        draftComplexity: undefined,
      });

      expect(result).toEqual({
        workflowId: 'wf-123',
        prompt: expect.stringContaining('backend-architect-moderate'),
        agentRole: AgentRole.BACKEND_ARCHITECT,
        complexity: 'moderate',
      });
    });

    it('should generate correct first agent prompt format per PRD §6.1', async () => {
      const userPrompt = 'Design backend API architecture';

      vi.mocked(parseIntent).mockReturnValue({
        roles: [AgentRole.BACKEND_ARCHITECT],
        keywords: ['design', 'backend', 'api'],
      });

      vi.mocked(analyzeComplexity).mockReturnValue(Complexity.COMPLEX);

      vi.mocked(resolveChain).mockReturnValue({
        chainName: ChainName.BACKEND_DESIGN_ONLY,
        agentSequence: [AgentRole.BACKEND_ARCHITECT],
      });

      const mockWorkflow: Workflow = {
        id: 'wf-456',
        userPrompt,
        chainName: ChainName.BACKEND_DESIGN_ONLY,
        complexity: 'complex',
        draftComplexity: null,
        currentStep: 0,
        status: 'ACTIVE',
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
      };
      vi.spyOn(mockStateManager, 'createWorkflow').mockResolvedValue(mockWorkflow);

      const result = await orchestrator.handleUserPrompt(userPrompt);

      // Verify prompt format matches PRD §6.1
      expect(result.prompt).toContain('Use the backend-architect-complex subagent');
      expect(result.prompt).toContain(userPrompt);
    });

    it('should handle frontend workflow correctly', async () => {
      const userPrompt = 'Create login component with form validation';

      vi.mocked(parseIntent).mockReturnValue({
        roles: [AgentRole.FRONTEND_DEVELOPER],
        keywords: ['component', 'login', 'form'],
      });

      vi.mocked(analyzeComplexity).mockReturnValue(Complexity.SIMPLE);

      vi.mocked(resolveChain).mockReturnValue({
        chainName: ChainName.FRONTEND_DEVELOPMENT,
        agentSequence: [
          AgentRole.FRONTEND_ARCHITECT,
          AgentRole.FRONTEND_DEVELOPER,
          AgentRole.REVIEWER,
        ],
      });

      const mockWorkflow: Workflow = {
        id: 'wf-789',
        userPrompt,
        chainName: ChainName.FRONTEND_DEVELOPMENT,
        complexity: 'simple',
        draftComplexity: null,
        currentStep: 0,
        status: 'ACTIVE',
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
      };
      vi.spyOn(mockStateManager, 'createWorkflow').mockResolvedValue(mockWorkflow);

      const result = await orchestrator.handleUserPrompt(userPrompt);

      expect(result.agentRole).toBe(AgentRole.FRONTEND_ARCHITECT);
      expect(result.prompt).toContain('frontend-architect-simple');
    });
  });

  describe('handleAgentComplete()', () => {
    it('should advance step, build context, and return next agent prompt', async () => {
      const workflowId = 'wf-123';
      const agentResults = {
        workflowId,
        agentRole: AgentRole.BACKEND_ARCHITECT,
        complexity: 'moderate' as const,
        stepNumber: 0,
        results: JSON.stringify({
          summary: 'Designed REST API with JWT authentication',
          design: 'API endpoints and auth flow',
        }),
        status: 'COMPLETED' as const,
      };

      // Mock workflow state
      const mockWorkflow: Workflow = {
        id: workflowId,
        userPrompt: 'Implement REST API',
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: 'moderate',
        draftComplexity: null,
        currentStep: 0,
        status: 'ACTIVE',
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
      };

      const updatedWorkflow: Workflow = {
        ...mockWorkflow,
        currentStep: 1,
      };

      vi.spyOn(mockStateManager, 'getWorkflow').mockResolvedValue(mockWorkflow);
      vi.mocked(mockAgentResultRepo.createResult).mockResolvedValue({} as AgentResult);
      vi.spyOn(mockStateManager, 'advanceStep').mockResolvedValue(updatedWorkflow);

      // Mock previous results for context
      const previousResults: AgentResult[] = [
        {
          id: 1,
          workflowId,
          agentRole: 'backend-architect',
          complexity: 'moderate',
          stepNumber: 0,
          results: agentResults.results,
          status: 'COMPLETED',
          createdAt: BigInt(Date.now()),
        },
      ];
      vi.mocked(mockAgentResultRepo.findByWorkflowId).mockResolvedValue(previousResults);

      // Mock context serializer
      vi.mocked(buildContextForAgent).mockReturnValue(
        'Previous agent results:\n1. [backend-architect]: Designed REST API with JWT authentication'
      );

      const result = await orchestrator.handleAgentComplete(workflowId, agentResults);

      // Verify
      expect(mockStateManager.getWorkflow).toHaveBeenCalledWith(workflowId);
      expect(mockAgentResultRepo.createResult).toHaveBeenCalledWith(agentResults);
      expect(mockStateManager.advanceStep).toHaveBeenCalledWith(
        workflowId,
        AgentRole.BACKEND_ARCHITECT
      );
      expect(mockAgentResultRepo.findByWorkflowId).toHaveBeenCalledWith(workflowId);
      expect(buildContextForAgent).toHaveBeenCalledWith(previousResults);

      expect(result).toEqual({
        workflowId,
        prompt: expect.stringContaining('backend-developer-moderate'),
        agentRole: AgentRole.BACKEND_DEVELOPER,
        complexity: 'moderate',
        previousContext: expect.stringContaining('Designed REST API'),
        status: 'continue',
      });
    });

    it('should generate correct next agent prompt format per PRD §6.2', async () => {
      const workflowId = 'wf-123';
      const agentResults = {
        workflowId,
        agentRole: AgentRole.BACKEND_ARCHITECT,
        complexity: 'moderate' as const,
        stepNumber: 0,
        results: JSON.stringify({
          summary: 'Architecture design complete',
        }),
        status: 'COMPLETED' as const,
      };

      const mockWorkflow: Workflow = {
        id: workflowId,
        userPrompt: 'Build API',
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: 'moderate',
        draftComplexity: null,
        currentStep: 0,
        status: 'ACTIVE',
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
      };

      vi.spyOn(mockStateManager, 'getWorkflow').mockResolvedValue(mockWorkflow);
      vi.mocked(mockAgentResultRepo.createResult).mockResolvedValue({} as AgentResult);
      vi.spyOn(mockStateManager, 'advanceStep').mockResolvedValue({
        ...mockWorkflow,
        currentStep: 1,
      });

      const previousResults: AgentResult[] = [
        {
          id: 1,
          workflowId,
          agentRole: 'backend-architect',
          complexity: 'moderate',
          stepNumber: 0,
          results: agentResults.results,
          status: 'COMPLETED',
          createdAt: BigInt(Date.now()),
        },
      ];
      vi.mocked(mockAgentResultRepo.findByWorkflowId).mockResolvedValue(previousResults);
      vi.mocked(buildContextForAgent).mockReturnValue(
        'Previous agent results:\n1. [backend-architect]: Architecture design complete'
      );

      const result = await orchestrator.handleAgentComplete(workflowId, agentResults);

      // Verify prompt format matches PRD §6.2
      expect(result.prompt).toContain('Use the backend-developer-moderate subagent');
      expect(result.prompt).toContain('Review previous results');
      expect(result.previousContext).toContain('Architecture design complete');
    });

    it('should complete workflow when at chain end', async () => {
      const workflowId = 'wf-123';
      const agentResults = {
        workflowId,
        agentRole: AgentRole.REVIEWER,
        complexity: 'moderate' as const,
        stepNumber: 2,
        results: JSON.stringify({
          summary: 'Code review complete, no issues found',
        }),
        status: 'COMPLETED' as const,
      };

      const mockWorkflow: Workflow = {
        id: workflowId,
        userPrompt: 'Implement API',
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: 'moderate',
        draftComplexity: null,
        currentStep: 2,
        status: 'ACTIVE',
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
      };

      const completedWorkflow: Workflow = {
        ...mockWorkflow,
        status: 'COMPLETED',
      };

      vi.spyOn(mockStateManager, 'getWorkflow').mockResolvedValue(mockWorkflow);
      vi.mocked(mockAgentResultRepo.createResult).mockResolvedValue({} as AgentResult);
      vi.spyOn(mockStateManager, 'advanceStep').mockResolvedValue(completedWorkflow);

      const result = await orchestrator.handleAgentComplete(workflowId, agentResults);

      expect(result).toEqual({
        workflowId,
        status: 'completed',
        message: expect.stringContaining('Workflow complete'),
      });
    });

    it('should handle workflow not found error', async () => {
      const workflowId = 'nonexistent-wf';
      const agentResults = {
        workflowId,
        agentRole: AgentRole.BACKEND_DEVELOPER,
        complexity: 'moderate' as const,
        stepNumber: 0,
        results: JSON.stringify({ summary: 'Test' }),
        status: 'COMPLETED' as const,
      };

      vi.spyOn(mockStateManager, 'getWorkflow').mockResolvedValue(null);

      await expect(orchestrator.handleAgentComplete(workflowId, agentResults)).rejects.toThrow(
        'Workflow not found'
      );
    });

    it('should handle agent failure and mark workflow as failed', async () => {
      const workflowId = 'wf-123';
      const agentResults = {
        workflowId,
        agentRole: AgentRole.BACKEND_DEVELOPER,
        complexity: 'moderate' as const,
        stepNumber: 1,
        results: JSON.stringify({
          summary: 'Implementation failed',
          error: 'Database connection error',
        }),
        status: 'FAILED' as const,
      };

      const mockWorkflow: Workflow = {
        id: workflowId,
        userPrompt: 'Implement API',
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: 'moderate',
        draftComplexity: null,
        currentStep: 1,
        status: 'ACTIVE',
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
      };

      const failedWorkflow: Workflow = {
        ...mockWorkflow,
        status: 'FAILED',
      };

      vi.spyOn(mockStateManager, 'getWorkflow').mockResolvedValue(mockWorkflow);
      vi.mocked(mockAgentResultRepo.createResult).mockResolvedValue({} as AgentResult);
      vi.spyOn(mockStateManager, 'failWorkflow').mockResolvedValue(failedWorkflow);

      const result = await orchestrator.handleAgentComplete(workflowId, agentResults);

      expect(mockStateManager.failWorkflow).toHaveBeenCalledWith(
        workflowId,
        expect.stringContaining('Agent failed')
      );
      expect(result).toEqual({
        workflowId,
        status: 'failed',
        message: expect.stringContaining('Workflow failed'),
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid prompt gracefully', async () => {
      const invalidPrompt = '';

      vi.mocked(parseIntent).mockReturnValue({
        roles: [],
        keywords: [],
      });

      await expect(orchestrator.handleUserPrompt(invalidPrompt)).rejects.toThrow();
    });

    it('should handle state manager errors', async () => {
      const userPrompt = 'Test prompt';

      vi.mocked(parseIntent).mockReturnValue({
        roles: [AgentRole.BACKEND_DEVELOPER],
        keywords: ['test'],
      });

      vi.mocked(analyzeComplexity).mockReturnValue(Complexity.SIMPLE);

      vi.mocked(resolveChain).mockReturnValue({
        chainName: ChainName.BACKEND_DEVELOPMENT,
        agentSequence: [AgentRole.BACKEND_DEVELOPER],
      });

      vi.spyOn(mockStateManager, 'createWorkflow').mockRejectedValue(
        new Error('Database error')
      );

      await expect(orchestrator.handleUserPrompt(userPrompt)).rejects.toThrow('Database error');
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle debug workflow correctly', async () => {
      const userPrompt = 'Debug authentication issue';

      vi.mocked(parseIntent).mockReturnValue({
        roles: [AgentRole.DEBUGGER],
        keywords: ['debug', 'authentication'],
      });

      vi.mocked(analyzeComplexity).mockReturnValue(Complexity.MODERATE);

      vi.mocked(resolveChain).mockReturnValue({
        chainName: ChainName.DEBUG,
        agentSequence: [AgentRole.DEBUGGER, AgentRole.BACKEND_DEVELOPER, AgentRole.REVIEWER],
      });

      const mockWorkflow: Workflow = {
        id: 'wf-debug',
        userPrompt,
        chainName: ChainName.DEBUG,
        complexity: 'moderate',
        draftComplexity: null,
        currentStep: 0,
        status: 'ACTIVE',
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
      };
      vi.spyOn(mockStateManager, 'createWorkflow').mockResolvedValue(mockWorkflow);

      const result = await orchestrator.handleUserPrompt(userPrompt);

      expect(result.agentRole).toBe(AgentRole.DEBUGGER);
      expect(result.prompt).toContain('debugger-moderate');
    });

    it('should handle review-only workflow', async () => {
      const userPrompt = 'Review my authentication code';

      vi.mocked(parseIntent).mockReturnValue({
        roles: [AgentRole.REVIEWER],
        keywords: ['review', 'authentication'],
      });

      vi.mocked(analyzeComplexity).mockReturnValue(Complexity.SIMPLE);

      vi.mocked(resolveChain).mockReturnValue({
        chainName: ChainName.REVIEW_ONLY,
        agentSequence: [AgentRole.REVIEWER],
      });

      const mockWorkflow: Workflow = {
        id: 'wf-review',
        userPrompt,
        chainName: ChainName.REVIEW_ONLY,
        complexity: 'simple',
        draftComplexity: null,
        currentStep: 0,
        status: 'ACTIVE',
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
      };
      vi.spyOn(mockStateManager, 'createWorkflow').mockResolvedValue(mockWorkflow);

      const result = await orchestrator.handleUserPrompt(userPrompt);

      expect(result.agentRole).toBe(AgentRole.REVIEWER);
      expect(result.complexity).toBe('simple');
    });
  });
});
