/**
 * Unit Tests: Workflow State Manager
 *
 * Tests for managing workflow lifecycle: creation, step advancement, completion.
 * Tests idempotency, chain boundary conditions, and state transitions.
 *
 * PRD Reference: §5.2 Step 4 - Workflow State Management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Workflow, AgentResult, WorkflowTransition } from '@prisma/client';
import type {
  IWorkflowRepository,
  ITransitionRepository,
  IAgentResultRepository,
  WorkflowStatus,
  Complexity,
} from '../../../src/types/repositories';
import { ChainName, AgentRole } from '../../../src/types/workflow';

// Mock interfaces for testing
const createMockWorkflowRepository = (): IWorkflowRepository => ({
  createWorkflow: vi.fn(),
  findById: vi.fn(),
  findByStatus: vi.fn(),
  findActive: vi.fn(),
  findActiveBySession: vi.fn(),
  updateStatus: vi.fn(),
  updateCurrentStep: vi.fn(),
  deleteWorkflow: vi.fn(),
});

const createMockTransitionRepository = (): ITransitionRepository => ({
  createTransition: vi.fn(),
  findByWorkflowId: vi.fn(),
  findLatest: vi.fn(),
});

const createMockAgentResultRepository = (): IAgentResultRepository => ({
  createResult: vi.fn(),
  findByWorkflowId: vi.fn(),
  findByWorkflowIdAndStep: vi.fn(),
});

// Helper to create mock workflow
const createMockWorkflow = (overrides?: Partial<Workflow>): Workflow => ({
  id: 'wf-test-123',
  userPrompt: 'Test prompt',
  chainName: 'backend-development',
  complexity: 'moderate',
  draftComplexity: null,
  currentStep: 0,
  status: 'ACTIVE',
  sessionId: null,
  createdAt: BigInt(Date.now()),
  updatedAt: BigInt(Date.now()),
  ...overrides,
});

// ============================================================================
// Workflow Creation Tests
// ============================================================================

describe('State Manager - Workflow Creation', () => {
  let workflowRepo: IWorkflowRepository;
  let transitionRepo: ITransitionRepository;
  let agentResultRepo: IAgentResultRepository;
  let StateManager: any;
  let stateManager: any;

  beforeEach(async () => {
    workflowRepo = createMockWorkflowRepository();
    transitionRepo = createMockTransitionRepository();
    agentResultRepo = createMockAgentResultRepository();

    // Dynamically import to get fresh instance
    const module = await import('../../../src/services/state-manager');
    StateManager = module.StateManager;
    stateManager = new StateManager(workflowRepo, transitionRepo);
  });

  it('should create workflow with UUID and ACTIVE status', async () => {
    const mockWorkflow = createMockWorkflow();
    vi.mocked(workflowRepo.createWorkflow).mockResolvedValue(mockWorkflow);
    vi.mocked(transitionRepo.createTransition).mockResolvedValue({} as WorkflowTransition);

    const result = await stateManager.createWorkflow({
      userPrompt: 'Implement REST API',
      chainName: ChainName.BACKEND_DEVELOPMENT,
      complexity: 'moderate' as Complexity,
    });

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.status).toBe('ACTIVE');
    expect(workflowRepo.createWorkflow).toHaveBeenCalledWith({
      userPrompt: 'Implement REST API',
      chainName: ChainName.BACKEND_DEVELOPMENT,
      complexity: 'moderate',
      currentStep: 0,
      status: 'ACTIVE',
    });
  });

  it('should create initial transition on workflow creation', async () => {
    const mockWorkflow = createMockWorkflow();
    vi.mocked(workflowRepo.createWorkflow).mockResolvedValue(mockWorkflow);
    vi.mocked(transitionRepo.createTransition).mockResolvedValue({} as WorkflowTransition);

    await stateManager.createWorkflow({
      userPrompt: 'Implement REST API',
      chainName: ChainName.BACKEND_DEVELOPMENT,
      complexity: 'moderate' as Complexity,
    });

    expect(transitionRepo.createTransition).toHaveBeenCalledWith({
      workflowId: mockWorkflow.id,
      fromStep: -1,
      toStep: 0,
      fromAgent: null,
      toAgent: expect.any(String), // First agent in chain
      reason: 'Workflow initialized',
    });
  });

  it('should create workflow with PENDING_COMPLEXITY status when complexity is draft', async () => {
    const mockWorkflow = createMockWorkflow({
      status: 'PENDING_COMPLEXITY',
      draftComplexity: 'moderate',
      complexity: 'moderate',
    });
    vi.mocked(workflowRepo.createWorkflow).mockResolvedValue(mockWorkflow);

    const result = await stateManager.createWorkflow({
      userPrompt: 'Implement REST API',
      chainName: ChainName.BACKEND_DEVELOPMENT,
      complexity: 'moderate' as Complexity,
      draftComplexity: 'moderate' as Complexity,
      status: 'PENDING_COMPLEXITY' as WorkflowStatus,
    });

    expect(result.status).toBe('PENDING_COMPLEXITY');
    expect(result.draftComplexity).toBe('moderate');
  });
});

// ============================================================================
// Step Advancement Tests
// ============================================================================

describe('State Manager - Step Advancement', () => {
  let workflowRepo: IWorkflowRepository;
  let transitionRepo: ITransitionRepository;
  let agentResultRepo: IAgentResultRepository;
  let StateManager: any;
  let stateManager: any;

  beforeEach(async () => {
    workflowRepo = createMockWorkflowRepository();
    transitionRepo = createMockTransitionRepository();
    agentResultRepo = createMockAgentResultRepository();

    const module = await import('../../../src/services/state-manager');
    StateManager = module.StateManager;
    stateManager = new StateManager(workflowRepo, transitionRepo);
  });

  it('should advance workflow to next step', async () => {
    const mockWorkflow = createMockWorkflow({ currentStep: 0 });
    const updatedWorkflow = createMockWorkflow({ currentStep: 1 });

    vi.mocked(workflowRepo.findById).mockResolvedValue(mockWorkflow);
    vi.mocked(workflowRepo.updateCurrentStep).mockResolvedValue(updatedWorkflow);
    vi.mocked(transitionRepo.createTransition).mockResolvedValue({} as WorkflowTransition);

    const result = await stateManager.advanceStep('wf-test-123', AgentRole.BACKEND_ARCHITECT);

    expect(result.currentStep).toBe(1);
    expect(workflowRepo.updateCurrentStep).toHaveBeenCalledWith('wf-test-123', 1);
  });

  it('should record transition when advancing step', async () => {
    const mockWorkflow = createMockWorkflow({ currentStep: 0 });
    const updatedWorkflow = createMockWorkflow({ currentStep: 1 });

    vi.mocked(workflowRepo.findById).mockResolvedValue(mockWorkflow);
    vi.mocked(workflowRepo.updateCurrentStep).mockResolvedValue(updatedWorkflow);
    vi.mocked(transitionRepo.createTransition).mockResolvedValue({} as WorkflowTransition);

    await stateManager.advanceStep('wf-test-123', AgentRole.BACKEND_ARCHITECT);

    expect(transitionRepo.createTransition).toHaveBeenCalledWith({
      workflowId: 'wf-test-123',
      fromStep: 0,
      toStep: 1,
      fromAgent: AgentRole.BACKEND_ARCHITECT,
      toAgent: expect.any(String), // Next agent in chain
      reason: expect.any(String),
    });
  });

  it('should handle idempotency - same step number is no-op', async () => {
    // Workflow already at step 1 (backend-architect already completed)
    const mockWorkflow = createMockWorkflow({ currentStep: 1 });

    vi.mocked(workflowRepo.findById).mockResolvedValue(mockWorkflow);

    // Try to advance from step 0 again (backend-architect), but workflow is already at step 1
    const result = await stateManager.advanceStep('wf-test-123', AgentRole.BACKEND_ARCHITECT);

    // Should return current workflow without updating (idempotent)
    expect(result).toEqual(mockWorkflow);
    expect(result.currentStep).toBe(1);
    expect(workflowRepo.updateCurrentStep).not.toHaveBeenCalled();
    expect(transitionRepo.createTransition).not.toHaveBeenCalled();
  });

  it('should complete workflow when advancing beyond chain length', async () => {
    const mockWorkflow = createMockWorkflow({
      currentStep: 2, // Last step in 3-agent chain (backend-architect → backend-developer → reviewer)
      chainName: 'backend-development',
    });
    const completedWorkflow = createMockWorkflow({
      currentStep: 2, // Stays at step 2 when completed
      status: 'COMPLETED',
    });

    vi.mocked(workflowRepo.findById).mockResolvedValue(mockWorkflow);
    vi.mocked(workflowRepo.updateStatus).mockResolvedValue(completedWorkflow);
    vi.mocked(transitionRepo.createTransition).mockResolvedValue({} as WorkflowTransition);

    const result = await stateManager.advanceStep('wf-test-123', AgentRole.REVIEWER);

    expect(result.status).toBe('COMPLETED');
    expect(workflowRepo.updateStatus).toHaveBeenCalledWith(
      'wf-test-123',
      'COMPLETED',
      2 // Workflow completes at current step, not next step
    );
  });

  it('should throw error if workflow not found', async () => {
    vi.mocked(workflowRepo.findById).mockResolvedValue(null);

    await expect(
      stateManager.advanceStep('nonexistent-wf', AgentRole.BACKEND_ARCHITECT)
    ).rejects.toThrow('Workflow not found');
  });

  it('should throw error if advancing non-ACTIVE workflow', async () => {
    const mockWorkflow = createMockWorkflow({ status: 'COMPLETED' });
    vi.mocked(workflowRepo.findById).mockResolvedValue(mockWorkflow);

    await expect(
      stateManager.advanceStep('wf-test-123', AgentRole.BACKEND_ARCHITECT)
    ).rejects.toThrow('Cannot advance workflow');
  });
});

// ============================================================================
// Workflow Completion Tests
// ============================================================================

describe('State Manager - Workflow Completion', () => {
  let workflowRepo: IWorkflowRepository;
  let transitionRepo: ITransitionRepository;
  let agentResultRepo: IAgentResultRepository;
  let StateManager: any;
  let stateManager: any;

  beforeEach(async () => {
    workflowRepo = createMockWorkflowRepository();
    transitionRepo = createMockTransitionRepository();
    agentResultRepo = createMockAgentResultRepository();

    const module = await import('../../../src/services/state-manager');
    StateManager = module.StateManager;
    stateManager = new StateManager(workflowRepo, transitionRepo);
  });

  it('should complete workflow and set COMPLETED status', async () => {
    const mockWorkflow = createMockWorkflow({ currentStep: 2 });
    const completedWorkflow = createMockWorkflow({ status: 'COMPLETED' });

    vi.mocked(workflowRepo.findById).mockResolvedValue(mockWorkflow);
    vi.mocked(workflowRepo.updateStatus).mockResolvedValue(completedWorkflow);
    vi.mocked(transitionRepo.createTransition).mockResolvedValue({} as WorkflowTransition);

    const result = await stateManager.completeWorkflow('wf-test-123', 'All agents completed successfully');

    expect(result.status).toBe('COMPLETED');
    expect(workflowRepo.updateStatus).toHaveBeenCalledWith('wf-test-123', 'COMPLETED', 2);
  });

  it('should record completion transition with reason', async () => {
    const mockWorkflow = createMockWorkflow({ currentStep: 2 });
    const completedWorkflow = createMockWorkflow({ status: 'COMPLETED' });

    vi.mocked(workflowRepo.findById).mockResolvedValue(mockWorkflow);
    vi.mocked(workflowRepo.updateStatus).mockResolvedValue(completedWorkflow);
    vi.mocked(transitionRepo.createTransition).mockResolvedValue({} as WorkflowTransition);

    await stateManager.completeWorkflow('wf-test-123', 'All agents completed successfully');

    expect(transitionRepo.createTransition).toHaveBeenCalledWith({
      workflowId: 'wf-test-123',
      fromStep: 2,
      toStep: 3,
      fromAgent: expect.any(String),
      toAgent: null,
      reason: 'All agents completed successfully',
    });
  });
});

// ============================================================================
// Workflow Failure Tests
// ============================================================================

describe('State Manager - Workflow Failure', () => {
  let workflowRepo: IWorkflowRepository;
  let transitionRepo: ITransitionRepository;
  let agentResultRepo: IAgentResultRepository;
  let StateManager: any;
  let stateManager: any;

  beforeEach(async () => {
    workflowRepo = createMockWorkflowRepository();
    transitionRepo = createMockTransitionRepository();
    agentResultRepo = createMockAgentResultRepository();

    const module = await import('../../../src/services/state-manager');
    StateManager = module.StateManager;
    stateManager = new StateManager(workflowRepo, transitionRepo);
  });

  it('should fail workflow and set FAILED status', async () => {
    const mockWorkflow = createMockWorkflow({ currentStep: 1 });
    const failedWorkflow = createMockWorkflow({ status: 'FAILED' });

    vi.mocked(workflowRepo.findById).mockResolvedValue(mockWorkflow);
    vi.mocked(workflowRepo.updateStatus).mockResolvedValue(failedWorkflow);
    vi.mocked(transitionRepo.createTransition).mockResolvedValue({} as WorkflowTransition);

    const result = await stateManager.failWorkflow('wf-test-123', 'Agent execution failed');

    expect(result.status).toBe('FAILED');
    expect(workflowRepo.updateStatus).toHaveBeenCalledWith('wf-test-123', 'FAILED', 1);
  });

  it('should record failure transition with error reason', async () => {
    const mockWorkflow = createMockWorkflow({ currentStep: 1 });
    const failedWorkflow = createMockWorkflow({ status: 'FAILED' });

    vi.mocked(workflowRepo.findById).mockResolvedValue(mockWorkflow);
    vi.mocked(workflowRepo.updateStatus).mockResolvedValue(failedWorkflow);
    vi.mocked(transitionRepo.createTransition).mockResolvedValue({} as WorkflowTransition);

    await stateManager.failWorkflow('wf-test-123', 'Agent execution failed');

    expect(transitionRepo.createTransition).toHaveBeenCalledWith({
      workflowId: 'wf-test-123',
      fromStep: 1,
      toStep: 1,
      fromAgent: expect.any(String),
      toAgent: null,
      reason: 'Workflow failed: Agent execution failed',
    });
  });
});

// ============================================================================
// Get Workflow State Tests
// ============================================================================

describe('State Manager - Get Workflow State', () => {
  let workflowRepo: IWorkflowRepository;
  let transitionRepo: ITransitionRepository;
  let agentResultRepo: IAgentResultRepository;
  let StateManager: any;
  let stateManager: any;

  beforeEach(async () => {
    workflowRepo = createMockWorkflowRepository();
    transitionRepo = createMockTransitionRepository();
    agentResultRepo = createMockAgentResultRepository();

    const module = await import('../../../src/services/state-manager');
    StateManager = module.StateManager;
    stateManager = new StateManager(workflowRepo, transitionRepo);
  });

  it('should retrieve workflow state by ID', async () => {
    const mockWorkflow = createMockWorkflow();
    vi.mocked(workflowRepo.findById).mockResolvedValue(mockWorkflow);

    const result = await stateManager.getWorkflow('wf-test-123');

    expect(result).toEqual(mockWorkflow);
    expect(workflowRepo.findById).toHaveBeenCalledWith('wf-test-123', undefined);
  });

  it('should retrieve workflow with relations when requested', async () => {
    const mockWorkflow = createMockWorkflow();
    const mockAgentResults = [
      { id: 1, workflowId: 'wf-test-123', stepNumber: 0 } as AgentResult,
    ];
    const mockTransitions = [
      { id: 1, workflowId: 'wf-test-123' } as WorkflowTransition,
    ];

    vi.mocked(workflowRepo.findById).mockResolvedValue({
      ...mockWorkflow,
      agentResults: mockAgentResults,
      transitions: mockTransitions,
    });

    const result = await stateManager.getWorkflow('wf-test-123', {
      includeAgentResults: true,
      includeTransitions: true,
    });

    expect(result.agentResults).toEqual(mockAgentResults);
    expect(result.transitions).toEqual(mockTransitions);
    expect(workflowRepo.findById).toHaveBeenCalledWith('wf-test-123', {
      includeAgentResults: true,
      includeTransitions: true,
    });
  });

  it('should return null for nonexistent workflow', async () => {
    vi.mocked(workflowRepo.findById).mockResolvedValue(null);

    const result = await stateManager.getWorkflow('nonexistent-wf');

    expect(result).toBeNull();
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('State Manager - Edge Cases', () => {
  let workflowRepo: IWorkflowRepository;
  let transitionRepo: ITransitionRepository;
  let agentResultRepo: IAgentResultRepository;
  let StateManager: any;
  let stateManager: any;

  beforeEach(async () => {
    workflowRepo = createMockWorkflowRepository();
    transitionRepo = createMockTransitionRepository();
    agentResultRepo = createMockAgentResultRepository();

    const module = await import('../../../src/services/state-manager');
    StateManager = module.StateManager;
    stateManager = new StateManager(workflowRepo, transitionRepo);
  });

  it('should handle single-agent chains correctly', async () => {
    const mockWorkflow = createMockWorkflow({
      currentStep: 0,
      chainName: 'review-only', // Single agent chain
    });
    const completedWorkflow = createMockWorkflow({
      currentStep: 1,
      status: 'COMPLETED',
    });

    vi.mocked(workflowRepo.findById).mockResolvedValue(mockWorkflow);
    vi.mocked(workflowRepo.updateStatus).mockResolvedValue(completedWorkflow);
    vi.mocked(transitionRepo.createTransition).mockResolvedValue({} as WorkflowTransition);

    const result = await stateManager.advanceStep('wf-test-123', AgentRole.REVIEWER);

    expect(result.status).toBe('COMPLETED');
  });

  it('should validate workflow state before operations', async () => {
    const mockWorkflow = createMockWorkflow({ status: 'FAILED' });
    vi.mocked(workflowRepo.findById).mockResolvedValue(mockWorkflow);

    await expect(
      stateManager.completeWorkflow('wf-test-123', 'Trying to complete failed workflow')
    ).rejects.toThrow();
  });

  it('should handle concurrent step advancement gracefully', async () => {
    const mockWorkflow = createMockWorkflow({ currentStep: 0 });
    const updatedWorkflow = createMockWorkflow({ currentStep: 1 });

    vi.mocked(workflowRepo.findById).mockResolvedValue(mockWorkflow);
    vi.mocked(workflowRepo.updateCurrentStep).mockResolvedValue(updatedWorkflow);
    vi.mocked(transitionRepo.createTransition).mockResolvedValue({} as WorkflowTransition);

    // Attempt to advance from same step (simulating concurrent request)
    const result1 = stateManager.advanceStep('wf-test-123', AgentRole.BACKEND_ARCHITECT);
    const result2 = stateManager.advanceStep('wf-test-123', AgentRole.BACKEND_ARCHITECT);

    const [r1, r2] = await Promise.all([result1, result2]);

    // Both should complete (in real scenario, database would handle concurrency)
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
  });
});
