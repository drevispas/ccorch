import { OrchestrationInterface } from '../../src/orchestration-interface.js';
import { testHelpers } from '../setup.js';
import { promises as fs } from 'fs';
import { join } from 'path';

describe('OrchestrationInterface Integration', () => {
  let orchestrationInterface: OrchestrationInterface;
  let mockTodoCallback: ReturnType<typeof testHelpers.createMockTodoCallback>;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await testHelpers.createTempDir('orchestration-integration');
    mockTodoCallback = testHelpers.createMockTodoCallback();

    // Create test workflow files
    await fs.mkdir(join(tempDir, 'workflows'), { recursive: true });
    await fs.mkdir(join(tempDir, 'agents'), { recursive: true });

    // Create a test workflow
    const testWorkflow = {
      name: 'Test Integration Workflow',
      description: 'Integration test workflow',
      use_case: 'Testing end-to-end integration functionality',
      agents: {
        sequence: [
          {
            name: 'test-agent',
            description: 'Execute integration test tasks',
            timeout: '5m',
            required: true
          }
        ]
      },
      context: {
        template: `# Task: {{task_description}}
Type: test-integration
Started: {{timestamp}}

## 1. Test Agent (test-agent)
Status: ⏳ Pending`
      },
      examples: [
        'Run integration tests',
        'Test system integration'
      ]
    };

    await fs.writeFile(
      join(tempDir, 'workflows', 'test-integration.yaml'),
      JSON.stringify(testWorkflow, null, 2)
    );

    // Create orchestration interface with custom paths
    orchestrationInterface = new OrchestrationInterface({
      enableMetrics: false  // Disable metrics for cleaner test output
    });

    // Override internal paths for testing
    const orchestrator = (orchestrationInterface as any).orchestrator;
    const workflowLoader = orchestrator.workflowLoader;
    (workflowLoader as any).workflowsDir = join(tempDir, 'workflows');

    const stateManager = orchestrator.stateManager;
    (stateManager as any).stateDir = join(tempDir, 'state');
    (stateManager as any).archiveDir = join(tempDir, 'archive');

    // Mock the agent execution to avoid actual Claude calls
    orchestrator.callClaudeAgent = jest.fn().mockResolvedValue({
      success: true,
      result: 'Mock integration test completed successfully',
      duration: 1000
    });

    await orchestrationInterface.initialize();
  });

  afterEach(async () => {
    await testHelpers.cleanupTempDir(tempDir);
  });

  describe('executeCommand', () => {
    it('should execute valid commands end-to-end', async () => {
      const command = 'Run test-integration workflow: Execute comprehensive integration tests';
      const result = await orchestrationInterface.executeCommand(command);

      expect(result).toContain('completed successfully');
      expect(result).toContain('wf_');
    });

    it('should provide suggestions for ambiguous commands', async () => {
      const command = 'I need help with testing';
      const result = await orchestrationInterface.executeCommand(command);

      expect(result).toContain('Suggested workflows');
      expect(result).toContain('test-integration');
      expect(result).toContain('match');
    });

    it('should provide help for unrecognizable commands', async () => {
      const command = 'completely random gibberish that makes no sense';
      const result = await orchestrationInterface.executeCommand(command);

      expect(result).toContain('Orchestration System Help');
      expect(result).toContain('How to Use');
    });

    it('should handle command execution errors gracefully', async () => {
      // Mock an error in the orchestrator
      const orchestrator = (orchestrationInterface as any).orchestrator;
      orchestrator.executeWorkflow = jest.fn().mockRejectedValue(new Error('Test execution error'));

      const command = 'Run test-integration workflow: This should fail';
      const result = await orchestrationInterface.executeCommand(command);

      expect(result).toContain('Failed to execute command');
      expect(result).toContain('Test execution error');
    });
  });

  describe('getWorkflowStatus', () => {
    it('should return status for specific workflow', async () => {
      // First execute a workflow
      const command = 'Run test-integration workflow: Test workflow status';
      const executeResult = await orchestrationInterface.executeCommand(command);

      // Extract workflow ID from result
      const workflowIdMatch = executeResult.match(/ID: (wf_\w+)/);
      expect(workflowIdMatch).not.toBeNull();

      const workflowId = workflowIdMatch![1];
      const statusResult = await orchestrationInterface.getWorkflowStatus(workflowId);

      expect(statusResult).toContain('Workflow Status');
      expect(statusResult).toContain(workflowId);
      expect(statusResult).toContain('Test Integration Workflow');
    });

    it('should list all active workflows when no ID provided', async () => {
      // Execute a couple of workflows
      await orchestrationInterface.executeCommand('Run test-integration workflow: First test');
      await orchestrationInterface.executeCommand('Run test-integration workflow: Second test');

      const statusResult = await orchestrationInterface.getWorkflowStatus();

      expect(statusResult).toContain('Active Workflows');
      expect(statusResult).toContain('Test Integration Workflow');
    });

    it('should handle non-existent workflow ID gracefully', async () => {
      const statusResult = await orchestrationInterface.getWorkflowStatus('non-existent-id');

      expect(statusResult).toContain('Failed to get workflow status');
    });
  });

  describe('listAvailableWorkflows', () => {
    it('should list all available workflow types', async () => {
      const result = await orchestrationInterface.listAvailableWorkflows();

      expect(result).toContain('Available Workflows');
      expect(result).toContain('Test Integration Workflow');
      expect(result).toContain('test-integration');
      expect(result).toContain('Integration test workflow');
    });

    it('should include examples for each workflow', async () => {
      const result = await orchestrationInterface.listAvailableWorkflows();

      expect(result).toContain('Examples:');
      expect(result).toContain('Run integration tests');
      expect(result).toContain('Test system integration');
    });
  });

  describe('getHelp', () => {
    it('should return comprehensive help documentation', async () => {
      const help = await orchestrationInterface.getHelp();

      expect(help).toContain('Orchestration System Help');
      expect(help).toContain('How to Use');
      expect(help).toContain('Example Commands');
      expect(help).toContain('Full Feature Development');
      expect(help).toContain('System Commands');
    });

    it('should include various workflow types in help', async () => {
      const help = await orchestrationInterface.getHelp();

      expect(help).toContain('Backend Development');
      expect(help).toContain('Frontend Development');
      expect(help).toContain('Bug Fixing & Debugging');
      expect(help).toContain('Emergency Hotfixes');
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle initialization failures gracefully', async () => {
      // Create interface with invalid configuration
      const badInterface = new OrchestrationInterface();

      // Override with non-existent directory
      const orchestrator = (badInterface as any).orchestrator;
      const workflowLoader = orchestrator.workflowLoader;
      (workflowLoader as any).workflowsDir = '/non/existent/directory';

      // Should not throw during initialization
      await expect(badInterface.initialize()).resolves.not.toThrow();
    });

    it('should handle workflow execution timeouts', async () => {
      // Mock a timeout scenario
      const orchestrator = (orchestrationInterface as any).orchestrator;
      orchestrator.executeWorkflow = jest.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Execution timeout')), 100);
        });
      });

      const command = 'Run test-integration workflow: This should timeout';
      const result = await orchestrationInterface.executeCommand(command);

      expect(result).toContain('Failed to execute command');
      expect(result).toContain('timeout');
    });

    it('should handle malformed workflow files', async () => {
      // Create a malformed workflow file
      await fs.writeFile(
        join(tempDir, 'workflows', 'malformed.yaml'),
        'invalid: yaml: content: ['
      );

      const command = 'Run malformed workflow: This should handle gracefully';
      const result = await orchestrationInterface.executeCommand(command);

      // Should provide suggestions since malformed workflow won't load
      expect(result).toContain('Suggested workflows');
    });

    it('should handle concurrent command execution', async () => {
      // Execute multiple commands concurrently
      const commands = [
        'Run test-integration workflow: Concurrent test 1',
        'Run test-integration workflow: Concurrent test 2',
        'Run test-integration workflow: Concurrent test 3'
      ];

      const results = await Promise.all(
        commands.map(cmd => orchestrationInterface.executeCommand(cmd))
      );

      // All should complete successfully
      results.forEach(result => {
        expect(result).toContain('completed successfully');
      });

      // Check that all workflows were created
      const statusResult = await orchestrationInterface.getWorkflowStatus();
      expect(statusResult).toContain('Concurrent test 1');
      expect(statusResult).toContain('Concurrent test 2');
      expect(statusResult).toContain('Concurrent test 3');
    });
  });

  describe('workflow execution flow', () => {
    it('should complete full workflow execution cycle', async () => {
      const command = 'Run test-integration workflow: Complete integration test cycle';

      // Execute workflow
      const executeResult = await orchestrationInterface.executeCommand(command);
      expect(executeResult).toContain('completed successfully');

      // Extract workflow ID
      const workflowIdMatch = executeResult.match(/ID: (wf_\w+)/);
      const workflowId = workflowIdMatch![1];

      // Check final status
      const statusResult = await orchestrationInterface.getWorkflowStatus(workflowId);
      expect(statusResult).toContain('completed');

      // Verify workflow was archived (should not be in active list)
      const activeResult = await orchestrationInterface.getWorkflowStatus();
      expect(activeResult).not.toContain(workflowId);
    });

    it('should handle partial workflow failures', async () => {
      // Mock agent failure
      const orchestrator = (orchestrationInterface as any).orchestrator;
      orchestrator.callClaudeAgent = jest.fn().mockRejectedValue(new Error('Agent execution failed'));

      const command = 'Run test-integration workflow: This should fail during execution';
      const result = await orchestrationInterface.executeCommand(command);

      expect(result).toContain('Failed to execute command');
      expect(result).toContain('Agent execution failed');
    });
  });
});