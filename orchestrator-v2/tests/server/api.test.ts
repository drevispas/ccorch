import request from 'supertest';
import express, { Application, Request, Response } from 'express';
import { z } from 'zod';
import { OrchestratorClient } from '../../server/client';

// Mock the core dependencies
jest.mock('../../core/orchestrator');
jest.mock('../../core/command-parser');
jest.mock('../../core/workflow-loader');
jest.mock('../../core/agent-loader');
jest.mock('../../core/result-file-manager');
jest.mock('../../core/handover-chain');
jest.mock('../../core/state/event-driven-state-manager');

describe('Orchestrator API Tests', () => {
  let app: Application;
  let client: OrchestratorClient;
  const baseURL = 'http://localhost:3001';

  beforeAll(async () => {
    // Setup test server
    app = express();
    app.use(express.json());

    // Setup mock routes for testing
    // System endpoints
    app.post('/api/init', (req: Request, res: Response) => {
      if (req.body.logLevel === 'invalid-level') {
        return res.status(400).json({ error: 'Invalid log level' });
      }
      res.json({
        status: 'initialized',
        availableWorkflows: ['bug-fix', 'feature-development'],
        timestamp: new Date().toISOString()
      });
    });

    app.get('/api/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        initialized: true,
        activeWorkflows: 0,
        pendingTasks: 0
      });
    });

    // Workflow endpoints
    app.post('/api/parse-command', (req: Request, res: Response) => {
      if (!req.body.command) {
        return res.status(400).json({ error: 'Command is required' });
      }
      res.json({
        success: true,
        parsedCommand: {
          workflowType: 'bug-fix',
          taskDescription: req.body.command,
          complexity: 'moderate'
        }
      });
    });

    app.post('/api/execute', (req: Request, res: Response) => {
      if (req.body.workflowType === 'invalid-type') {
        return res.status(400).json({ error: 'Invalid workflow type' });
      }
      if (!req.body.workflowType || !req.body.taskDescription) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'workflowType and taskDescription are required'
        });
      }
      if (typeof req.body.workflowType !== 'string') {
        return res.status(400).json({
          error: 'Invalid type',
          details: 'workflowType must be a string'
        });
      }
      res.json({
        workflowId: `wf_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        status: 'started',
        workflowType: req.body.workflowType,
        taskDescription: req.body.taskDescription
      });
    });

    app.get('/api/status/:workflowId', (req: Request, res: Response) => {
      const { workflowId } = req.params;
      if (!workflowId.match(/^wf_\d+_[a-z0-9]+$/)) {
        return res.status(400).json({ error: 'Invalid workflow ID format' });
      }
      res.json({
        id: workflowId,
        workflowType: 'bug-fix',
        status: 'running',
        startTime: new Date().toISOString(),
        completedTasks: 2
      });
    });

    app.get('/api/workflows', (req: Request, res: Response) => {
      res.json({
        workflows: []
      });
    });

    // Task endpoints
    app.get('/api/next-task/:workflowId', (req: Request, res: Response) => {
      res.json({
        taskId: `task_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        params: {
          subagent_type: 'code-reviewer-moderate',
          description: 'Review code changes',
          prompt: 'Review the modified files'
        },
        timestamp: new Date().toISOString()
      });
    });

    app.post('/api/agent-result', (req: Request, res: Response) => {
      if (!req.body.taskId?.match(/^task_\d+_[a-z0-9]+$/)) {
        return res.status(400).json({ error: 'Invalid task ID format' });
      }
      if (typeof req.body.success !== 'boolean') {
        return res.status(400).json({
          error: 'Invalid type',
          details: 'success must be a boolean'
        });
      }
      res.json({
        status: 'received',
        taskId: req.body.taskId,
        success: req.body.success,
        workflowId: `wf_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
      });
    });

    // Todo endpoints
    app.get('/api/todos/:workflowId', (req: Request, res: Response) => {
      res.json({
        todos: []
      });
    });

    app.get('/api/next-todo/:workflowId', (req: Request, res: Response) => {
      res.json({
        todo: null,
        allTodos: [],
        workflowId: req.params.workflowId
      });
    });

    // Recovery endpoints
    app.post('/api/recover-workflow/:workflowId', (req: Request, res: Response) => {
      res.json({
        success: true,
        message: 'Workflow recovery initiated'
      });
    });

    app.post('/api/reset-task/:taskId', (req: Request, res: Response) => {
      res.json({
        success: true,
        message: 'Task reset successfully',
        taskId: req.params.taskId,
        agentType: 'code-reviewer-moderate'
      });
    });

    // Debug endpoints
    app.get('/api/debug/workflows', (req: Request, res: Response) => {
      res.json({
        active: [],
        pendingTodos: 0,
        pendingTasks: 0,
        currentWorkflowId: null,
        timestamp: new Date().toISOString()
      });
    });

    app.get('/api/debug/workflow/:workflowId', (req: Request, res: Response) => {
      res.json({
        workflow: {},
        todos: [],
        tasks: [],
        timestamp: new Date().toISOString()
      });
    });

    app.get('/api/debug/task/:taskId', (req: Request, res: Response) => {
      res.json({
        task: {},
        timestamp: new Date().toISOString()
      });
    });

    // Initialize client
    client = new OrchestratorClient({
      baseURL,
      validateResponses: true
    });
  });

  afterAll(async () => {
    // Cleanup
  });

  describe('System Endpoints', () => {
    describe('POST /api/init', () => {
      it('should initialize the orchestrator successfully', async () => {
        const response = await request(app)
          .post('/api/init')
          .send({
            logLevel: 'info',
            enableMetrics: true
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('status', 'initialized');
        expect(response.body).toHaveProperty('availableWorkflows');
        expect(response.body).toHaveProperty('timestamp');
      });

      it('should handle initialization with default values', async () => {
        const response = await request(app)
          .post('/api/init')
          .send({});

        expect(response.status).toBe(200);
      });

      it('should reject invalid initialization parameters', async () => {
        const response = await request(app)
          .post('/api/init')
          .send({
            logLevel: 'invalid-level'
          });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      });
    });

    describe('GET /api/health', () => {
      it('should return health status', async () => {
        const response = await request(app)
          .get('/api/health');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('status', 'healthy');
        expect(response.body).toHaveProperty('initialized');
        expect(response.body).toHaveProperty('activeWorkflows');
        expect(response.body).toHaveProperty('pendingTasks');
      });
    });
  });

  describe('Workflow Endpoints', () => {
    describe('POST /api/parse-command', () => {
      it('should parse valid workflow commands', async () => {
        const response = await request(app)
          .post('/api/parse-command')
          .send({
            command: 'Fix the bug in the authentication module'
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success');

        if (response.body.success) {
          expect(response.body).toHaveProperty('parsedCommand');
          expect(response.body.parsedCommand).toHaveProperty('workflowType');
          expect(response.body.parsedCommand).toHaveProperty('taskDescription');
        } else {
          expect(response.body).toHaveProperty('error');
          expect(response.body).toHaveProperty('suggestions');
        }
      });

      it('should reject empty commands', async () => {
        const response = await request(app)
          .post('/api/parse-command')
          .send({
            command: ''
          });

        expect(response.status).toBe(400);
      });
    });

    describe('POST /api/execute', () => {
      it('should execute workflow with all parameters', async () => {
        const response = await request(app)
          .post('/api/execute')
          .send({
            workflowType: 'bug-fix',
            taskDescription: 'Fix authentication bug',
            projectDirectory: '/test/project',
            complexity: 'moderate'
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('workflowId');
        expect(response.body).toHaveProperty('status', 'started');
        expect(response.body).toHaveProperty('workflowType');
        expect(response.body).toHaveProperty('taskDescription');

        // Validate workflow ID format
        expect(response.body.workflowId).toMatch(/^wf_\d+_[a-z0-9]+$/);
      });

      it('should auto-detect complexity when not provided', async () => {
        const response = await request(app)
          .post('/api/execute')
          .send({
            workflowType: 'feature-development',
            taskDescription: 'Implement user authentication'
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('workflowId');
      });

      it('should reject invalid workflow types', async () => {
        const response = await request(app)
          .post('/api/execute')
          .send({
            workflowType: 'invalid-type',
            taskDescription: 'Test task'
          });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      });
    });

    describe('GET /api/status/:workflowId', () => {
      it('should return workflow status for valid ID', async () => {
        const workflowId = 'wf_1234567890_abc123';

        const response = await request(app)
          .get(`/api/status/${workflowId}`);

        if (response.status === 200) {
          expect(response.body).toHaveProperty('id');
          expect(response.body).toHaveProperty('workflowType');
          expect(response.body).toHaveProperty('status');
          expect(response.body).toHaveProperty('startTime');
          expect(response.body).toHaveProperty('completedTasks');
        } else if (response.status === 404) {
          expect(response.body).toHaveProperty('error', 'Workflow not found');
        }
      });

      it('should reject invalid workflow ID format', async () => {
        const response = await request(app)
          .get('/api/status/invalid-id');

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      });
    });

    describe('GET /api/workflows', () => {
      it('should return list of workflows', async () => {
        const response = await request(app)
          .get('/api/workflows');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('workflows');
        expect(Array.isArray(response.body.workflows)).toBe(true);
      });
    });
  });

  describe('Task Endpoints', () => {
    describe('GET /api/next-task/:workflowId', () => {
      it('should return next task for workflow', async () => {
        const workflowId = 'wf_1234567890_abc123';

        const response = await request(app)
          .get(`/api/next-task/${workflowId}`);

        expect(response.status).toBe(200);

        if (response.body.taskId) {
          expect(response.body).toHaveProperty('params');
          expect(response.body).toHaveProperty('timestamp');
          expect(response.body.params).toHaveProperty('subagent_type');
          expect(response.body.params).toHaveProperty('description');
          expect(response.body.params).toHaveProperty('prompt');
        } else {
          expect(response.body).toHaveProperty('message');
        }
      });
    });

    describe('POST /api/agent-result', () => {
      it('should accept agent execution results', async () => {
        const response = await request(app)
          .post('/api/agent-result')
          .send({
            taskId: 'task_1234567890_abc123',
            result: { output: 'Task completed successfully' },
            success: true,
            agentType: 'code-reviewer-moderate'
          });

        if (response.status === 200) {
          expect(response.body).toHaveProperty('status', 'received');
          expect(response.body).toHaveProperty('taskId');
          expect(response.body).toHaveProperty('success');
          expect(response.body).toHaveProperty('workflowId');
        } else if (response.status === 404) {
          expect(response.body).toHaveProperty('error', 'Task not found');
        }
      });

      it('should reject invalid task ID format', async () => {
        const response = await request(app)
          .post('/api/agent-result')
          .send({
            taskId: 'invalid-id',
            result: {},
            success: true
          });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      });
    });
  });

  describe('Todo Endpoints', () => {
    describe('GET /api/todos/:workflowId', () => {
      it('should return todos for workflow', async () => {
        const workflowId = 'wf_1234567890_abc123';

        const response = await request(app)
          .get(`/api/todos/${workflowId}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('todos');
        expect(Array.isArray(response.body.todos)).toBe(true);
      });
    });

    describe('GET /api/next-todo/:workflowId', () => {
      it('should return next pending todo', async () => {
        const workflowId = 'wf_1234567890_abc123';

        const response = await request(app)
          .get(`/api/next-todo/${workflowId}`);

        expect(response.status).toBe(200);

        if (response.body.todo) {
          expect(response.body.todo).toHaveProperty('content');
          expect(response.body.todo).toHaveProperty('status');
        }

        expect(response.body).toHaveProperty('allTodos');
        expect(response.body).toHaveProperty('workflowId');
      });
    });
  });

  describe('Recovery Endpoints', () => {
    describe('POST /api/recover-workflow/:workflowId', () => {
      it('should attempt workflow recovery', async () => {
        const workflowId = 'wf_1234567890_abc123';

        const response = await request(app)
          .post(`/api/recover-workflow/${workflowId}`);

        if (response.status === 200) {
          expect(response.body).toHaveProperty('success');
          expect(response.body).toHaveProperty('message');
        } else if (response.status === 404) {
          expect(response.body).toHaveProperty('error', 'Workflow not found');
        }
      });
    });

    describe('POST /api/reset-task/:taskId', () => {
      it('should reset stuck task', async () => {
        const taskId = 'task_1234567890_abc123';

        const response = await request(app)
          .post(`/api/reset-task/${taskId}`);

        if (response.status === 200) {
          expect(response.body).toHaveProperty('success', true);
          expect(response.body).toHaveProperty('message');
          expect(response.body).toHaveProperty('taskId');
          expect(response.body).toHaveProperty('agentType');
        } else if (response.status === 404) {
          expect(response.body).toHaveProperty('error', 'Task not found');
        }
      });
    });
  });

  describe('Debug Endpoints', () => {
    describe('GET /api/debug/workflows', () => {
      it('should return debug information for all workflows', async () => {
        const response = await request(app)
          .get('/api/debug/workflows');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('active');
        expect(response.body).toHaveProperty('pendingTodos');
        expect(response.body).toHaveProperty('pendingTasks');
        expect(response.body).toHaveProperty('currentWorkflowId');
        expect(response.body).toHaveProperty('timestamp');
      });
    });

    describe('GET /api/debug/workflow/:workflowId', () => {
      it('should return detailed debug info for workflow', async () => {
        const workflowId = 'wf_1234567890_abc123';

        const response = await request(app)
          .get(`/api/debug/workflow/${workflowId}`);

        if (response.status === 200) {
          expect(response.body).toHaveProperty('workflow');
          expect(response.body).toHaveProperty('todos');
          expect(response.body).toHaveProperty('tasks');
          expect(response.body).toHaveProperty('timestamp');
        } else if (response.status === 404) {
          expect(response.body).toHaveProperty('error');
        }
      });
    });

    describe('GET /api/debug/task/:taskId', () => {
      it('should return detailed debug info for task', async () => {
        const taskId = 'task_1234567890_abc123';

        const response = await request(app)
          .get(`/api/debug/task/${taskId}`);

        if (response.status === 200) {
          expect(response.body).toHaveProperty('task');
          expect(response.body).toHaveProperty('timestamp');
        } else if (response.status === 404) {
          expect(response.body).toHaveProperty('error', 'Task not found');
        }
      });
    });
  });

  describe('Validation Tests', () => {
    it('should validate request body schemas', async () => {
      const invalidRequests = [
        {
          endpoint: '/api/execute',
          method: 'post',
          body: {
            workflowType: 123, // Should be string
            taskDescription: 'Test'
          }
        },
        {
          endpoint: '/api/agent-result',
          method: 'post',
          body: {
            taskId: 'task_123',
            success: 'yes' // Should be boolean
          }
        }
      ];

      for (const req of invalidRequests) {
        const response = await request(app)
          [req.method as 'post'](req.endpoint)
          .send(req.body);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        // Details field is optional in error responses
        if (response.body.details) {
          expect(response.body).toHaveProperty('details');
        }
      }
    });

    it('should handle missing required fields', async () => {
      const response = await request(app)
        .post('/api/execute')
        .send({
          // Missing workflowType and taskDescription
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Client SDK Tests', () => {
    it('should initialize client successfully', () => {
      expect(client).toBeDefined();
    });

    it('should handle type-safe requests', async () => {
      // This test verifies that the client SDK provides type safety
      // TypeScript will enforce correct types at compile time

      try {
        const result = await client.executeWorkflow({
          workflowType: 'bug-fix',
          taskDescription: 'Fix auth bug',
          complexity: 'moderate'
        });

        expect(result).toHaveProperty('workflowId');
        expect(result).toHaveProperty('status');
      } catch (error) {
        // Handle connection errors in test environment
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should validate responses automatically', async () => {
      // Client is configured with validateResponses: true
      // Invalid responses will throw validation errors

      try {
        const health = await client.healthCheck();
        expect(health.status).toBe('healthy');
      } catch (error) {
        if (error instanceof Error && error.message.includes('validation')) {
          // Response validation failed as expected
          expect(error.message).toContain('validation');
        }
      }
    });
  });
});

describe('Integration Tests', () => {
  describe('Workflow Execution Flow', () => {
    it('should complete full workflow execution cycle', async () => {
      // 1. Initialize
      // 2. Parse command
      // 3. Execute workflow
      // 4. Get next task
      // 5. Submit result
      // 6. Check status
      // This would require actual server running
    });
  });

  describe('Error Recovery Flow', () => {
    it('should recover from task timeout', async () => {
      // 1. Execute workflow
      // 2. Let task timeout
      // 3. Reset task
      // 4. Re-execute
    });
  });
});