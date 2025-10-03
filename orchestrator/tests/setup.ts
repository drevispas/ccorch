// Jest setup file for orchestration system tests

import { promises as fs } from 'fs';
import { join } from 'path';

// Global test configuration
global.console = {
  ...console,
  // Suppress debug logs during tests unless DEBUG env var is set
  debug: process.env.DEBUG ? console.debug : jest.fn(),
  log: process.env.DEBUG ? console.log : jest.fn(),
};

// Test helper utilities
export const testHelpers = {
  // Create temporary directories for test isolation
  async createTempDir(baseName: string): Promise<string> {
    const tempDir = join(process.cwd(), 'tmp', `test-${baseName}-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    return tempDir;
  },

  // Clean up temporary directories
  async cleanupTempDir(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  },

  // Create mock workflow definition
  createMockWorkflow(name: string) {
    return {
      name: `Test ${name}`,
      description: `Test workflow for ${name}`,
      use_case: `Testing ${name.toLowerCase()} functionality`,
      agents: {
        sequence: [
          {
            name: 'test-agent',
            description: 'Mock test agent',
            timeout: '5m',
            required: true
          }
        ]
      },
      context: {
        template: `# Test Task: {{task_description}}\nStarted: {{timestamp}}\n\n## Test Agent\nStatus: ⏳ Pending`
      },
      examples: [
        `Test ${name.toLowerCase()} example`,
        `Another ${name.toLowerCase()} test case`
      ]
    };
  },

  // Create mock workflow state
  createMockWorkflowState(id: string, workflowName: string) {
    return {
      id,
      workflowName,
      taskDescription: 'Test task description',
      status: 'pending' as const,
      startTime: new Date(),
      currentStepIndex: 0,
      stepStates: [
        {
          index: 0,
          agentName: 'test-agent',
          status: 'pending' as const
        }
      ],
      context: {}
    };
  },

  // Mock TodoWrite callback
  createMockTodoCallback() {
    const calls: any[] = [];
    const callback = jest.fn().mockImplementation((todos) => {
      calls.push(todos);
      return Promise.resolve();
    });

    return {
      callback,
      calls,
      getLastCall: () => calls[calls.length - 1],
      getCallCount: () => calls.length
    };
  }
};

// Make test helpers available globally
(global as any).testHelpers = testHelpers;

// Increase timeout for integration tests
jest.setTimeout(30000);

// Setup and teardown
beforeEach(() => {
  // Reset any global state before each test
  jest.clearAllMocks();
});

afterEach(async () => {
  // Cleanup any test artifacts
  const tmpDir = join(process.cwd(), 'tmp');
  try {
    const exists = await fs.access(tmpDir).then(() => true).catch(() => false);
    if (exists) {
      const files = await fs.readdir(tmpDir);
      const testDirs = files.filter(f => f.startsWith('test-'));

      // Only clean up test directories older than 1 hour
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      for (const dir of testDirs) {
        const dirPath = join(tmpDir, dir);
        const stats = await fs.stat(dirPath);
        if (stats.mtime.getTime() < oneHourAgo) {
          await fs.rm(dirPath, { recursive: true, force: true });
        }
      }
    }
  } catch (error) {
    // Ignore cleanup errors
  }
});

// Process cleanup
process.on('exit', () => {
  // Final cleanup
});

export default {};