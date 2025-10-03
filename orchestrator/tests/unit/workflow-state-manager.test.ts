import { WorkflowStateManager } from '../../src/workflow-state-manager.js';
import { testHelpers } from '../setup.js';
import { promises as fs } from 'fs';
import { join } from 'path';

describe('WorkflowStateManager', () => {
  let stateManager: WorkflowStateManager;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await testHelpers.createTempDir('state-manager');

    // Create a custom state manager with temp directory
    stateManager = new WorkflowStateManager();
    // Override the directories for testing
    (stateManager as any).stateDir = join(tempDir, 'state');
    (stateManager as any).archiveDir = join(tempDir, 'archive');

    await stateManager.initialize();
  });

  afterEach(async () => {
    await testHelpers.cleanupTempDir(tempDir);
  });

  describe('createWorkflow', () => {
    it('should create a new workflow with proper initial state', async () => {
      const workflow = await stateManager.createWorkflow(
        'Test Workflow',
        'Test task description',
        3
      );

      expect(workflow).toMatchObject({
        workflowName: 'Test Workflow',
        taskDescription: 'Test task description',
        status: 'pending',
        currentStepIndex: 0
      });

      expect(workflow.id).toMatch(/^wf_\d+_[a-z0-9]{6}$/);
      expect(workflow.stepStates).toHaveLength(3);
      expect(workflow.startTime).toBeInstanceOf(Date);
    });

    it('should persist workflow state to disk', async () => {
      const workflow = await stateManager.createWorkflow('Test', 'Description', 2);

      const stateFile = join(tempDir, 'state', `${workflow.id}.json`);
      const fileExists = await fs.access(stateFile).then(() => true).catch(() => false);

      expect(fileExists).toBe(true);
    });
  });

  describe('updateWorkflowStatus', () => {
    it('should update workflow status correctly', async () => {
      const workflow = await stateManager.createWorkflow('Test', 'Description', 1);

      await stateManager.updateWorkflowStatus(workflow.id, 'running');

      const updatedState = await stateManager.getState(workflow.id);
      expect(updatedState.status).toBe('running');
    });

    it('should set endTime when workflow completes', async () => {
      const workflow = await stateManager.createWorkflow('Test', 'Description', 1);

      await stateManager.updateWorkflowStatus(workflow.id, 'completed');

      const updatedState = await stateManager.getState(workflow.id);
      expect(updatedState.status).toBe('completed');
      expect(updatedState.endTime).toBeInstanceOf(Date);
    });
  });

  describe('updateStepState', () => {
    it('should update individual step states', async () => {
      const workflow = await stateManager.createWorkflow('Test', 'Description', 2);

      await stateManager.updateStepState(workflow.id, 0, {
        agentName: 'test-agent',
        status: 'running'
      });

      const updatedState = await stateManager.getState(workflow.id);
      expect(updatedState.stepStates[0]).toMatchObject({
        agentName: 'test-agent',
        status: 'running'
      });
      expect(updatedState.stepStates[0].startTime).toBeInstanceOf(Date);
      expect(updatedState.currentStepIndex).toBe(0);
    });

    it('should set endTime when step completes', async () => {
      const workflow = await stateManager.createWorkflow('Test', 'Description', 1);

      await stateManager.updateStepState(workflow.id, 0, {
        status: 'completed',
        result: 'Test result'
      });

      const updatedState = await stateManager.getState(workflow.id);
      expect(updatedState.stepStates[0].endTime).toBeInstanceOf(Date);
      expect(updatedState.stepStates[0].result).toBe('Test result');
    });

    it('should handle out-of-bounds step indices gracefully', async () => {
      const workflow = await stateManager.createWorkflow('Test', 'Description', 1);

      // Should not throw
      await stateManager.updateStepState(workflow.id, 5, {
        status: 'completed'
      });

      const state = await stateManager.getState(workflow.id);
      expect(state.stepStates).toHaveLength(1);
    });
  });

  describe('getWorkflowProgress', () => {
    it('should calculate progress correctly', async () => {
      const workflow = await stateManager.createWorkflow('Test', 'Description', 3);

      // Complete first step
      await stateManager.updateStepState(workflow.id, 0, { status: 'completed' });
      // Start second step
      await stateManager.updateStepState(workflow.id, 1, { status: 'running' });

      const progress = await stateManager.getWorkflowProgress(workflow.id);

      expect(progress).toMatchObject({
        total: 3,
        completed: 1,
        running: 1,
        pending: 1,
        failed: 0,
        percentage: 33
      });
    });

    it('should handle empty workflow', async () => {
      const workflow = await stateManager.createWorkflow('Test', 'Description', 0);

      const progress = await stateManager.getWorkflowProgress(workflow.id);

      expect(progress.percentage).toBe(0);
      expect(progress.total).toBe(0);
    });
  });

  describe('archiveWorkflow', () => {
    it('should archive completed workflow', async () => {
      const workflow = await stateManager.createWorkflow('Test', 'Description', 1);
      await stateManager.updateWorkflowStatus(workflow.id, 'completed');

      await stateManager.archiveWorkflow(workflow.id);

      // Check that archive file exists
      const archiveFile = join(tempDir, 'archive', `${workflow.id}.json`);
      const archiveExists = await fs.access(archiveFile).then(() => true).catch(() => false);
      expect(archiveExists).toBe(true);

      // Check that state file is removed
      const stateFile = join(tempDir, 'state', `${workflow.id}.json`);
      const stateExists = await fs.access(stateFile).then(() => true).catch(() => false);
      expect(stateExists).toBe(false);
    });

    it('should include metrics in archived workflow', async () => {
      const workflow = await stateManager.createWorkflow('Test', 'Description', 1);
      await stateManager.updateStepState(workflow.id, 0, {
        agentName: 'test-agent',
        status: 'running'
      });

      // Simulate some execution time
      await new Promise(resolve => setTimeout(resolve, 10));

      await stateManager.updateStepState(workflow.id, 0, {
        status: 'completed'
      });
      await stateManager.updateWorkflowStatus(workflow.id, 'completed');

      await stateManager.archiveWorkflow(workflow.id);

      const archiveFile = join(tempDir, 'archive', `${workflow.id}.json`);
      const archivedData = JSON.parse(await fs.readFile(archiveFile, 'utf-8'));

      expect(archivedData.metrics).toBeDefined();
      expect(archivedData.metrics.workflowId).toBe(workflow.id);
      expect(archivedData.metrics.successRate).toBe(100);
      expect(archivedData.archivedAt).toBeDefined();
    });
  });

  describe('listActiveWorkflows', () => {
    it('should return list of active workflows', async () => {
      const workflow1 = await stateManager.createWorkflow('Test1', 'Description1', 1);
      const workflow2 = await stateManager.createWorkflow('Test2', 'Description2', 1);

      const activeWorkflows = await stateManager.listActiveWorkflows();

      expect(activeWorkflows).toHaveLength(2);
      expect(activeWorkflows.map(w => w.id)).toContain(workflow1.id);
      expect(activeWorkflows.map(w => w.id)).toContain(workflow2.id);
    });

    it('should sort workflows by start time (newest first)', async () => {
      const workflow1 = await stateManager.createWorkflow('Test1', 'Description1', 1);

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const workflow2 = await stateManager.createWorkflow('Test2', 'Description2', 1);

      const activeWorkflows = await stateManager.listActiveWorkflows();

      expect(activeWorkflows[0].id).toBe(workflow2.id);
      expect(activeWorkflows[1].id).toBe(workflow1.id);
    });

    it('should return empty array when no active workflows', async () => {
      const activeWorkflows = await stateManager.listActiveWorkflows();
      expect(activeWorkflows).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should throw error for non-existent workflow', async () => {
      await expect(stateManager.getState('non-existent-id'))
        .rejects
        .toThrow('Failed to load workflow state: non-existent-id');
    });

    it('should handle corrupted state files gracefully', async () => {
      const workflow = await stateManager.createWorkflow('Test', 'Description', 1);

      // Corrupt the state file
      const stateFile = join(tempDir, 'state', `${workflow.id}.json`);
      await fs.writeFile(stateFile, 'invalid json content');

      await expect(stateManager.getState(workflow.id))
        .rejects
        .toThrow();
    });
  });
});