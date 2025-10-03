import { v4 as uuidv4 } from 'uuid';
import { EventDrivenStateManager } from '../../core/state/event-driven-state-manager';
import {
  Command,
  Query,
  WorkflowState,
  SystemMetrics,
  WorkflowStatus,
  TaskStatus,
  AgentStatus,
  ComplexityLevel
} from '../../core/state/types';

describe('EventDrivenStateManager', () => {
  let stateManager: EventDrivenStateManager;

  beforeEach(() => {
    stateManager = new EventDrivenStateManager({
      enableLogging: false,
      enableSnapshots: false
    });
  });

  afterEach(async () => {
    await stateManager.destroy();
  });

  describe('Workflow Management', () => {
    it('should create a new workflow', async () => {
      const workflowId = uuidv4();
      const correlationId = uuidv4();

      const command: Command = {
        id: uuidv4(),
        type: 'CreateWorkflow',
        payload: {
          id: workflowId,
          name: 'Test Workflow',
          description: 'A test workflow',
          context: { test: true },
          tags: ['test']
        },
        metadata: {
          correlationId,
          userId: 'test-user'
        },
        timestamp: new Date()
      };

      await stateManager.executeCommand(command);

      const query: Query = {
        id: uuidv4(),
        type: 'GetWorkflow',
        criteria: { workflowId },
        metadata: {
          correlationId
        }
      };

      const result = await stateManager.executeQuery(query);

      expect(result.data).toBeDefined();
      expect(result.data.id).toBe(workflowId);
      expect(result.data.name).toBe('Test Workflow');
      expect(result.data.status).toBe(WorkflowStatus.PENDING);
      expect(result.data.tags).toContain('test');
    });

    it('should update workflow status', async () => {
      const workflowId = uuidv4();
      const correlationId = uuidv4();

      await stateManager.executeCommand({
        id: uuidv4(),
        type: 'CreateWorkflow',
        payload: {
          id: workflowId,
          name: 'Test Workflow'
        },
        metadata: { correlationId },
        timestamp: new Date()
      });

      await stateManager.executeCommand({
        id: uuidv4(),
        type: 'UpdateWorkflowStatus',
        payload: {
          workflowId,
          status: WorkflowStatus.RUNNING
        },
        metadata: { correlationId },
        timestamp: new Date()
      });

      const result = await stateManager.executeQuery({
        id: uuidv4(),
        type: 'GetWorkflow',
        criteria: { workflowId },
        metadata: { correlationId }
      });

      expect(result.data.status).toBe(WorkflowStatus.RUNNING);
    });

    it('should complete a workflow', async () => {
      const workflowId = uuidv4();
      const correlationId = uuidv4();

      await stateManager.executeCommand({
        id: uuidv4(),
        type: 'CreateWorkflow',
        payload: {
          id: workflowId,
          name: 'Test Workflow'
        },
        metadata: { correlationId },
        timestamp: new Date()
      });

      await stateManager.executeCommand({
        id: uuidv4(),
        type: 'CompleteWorkflow',
        payload: {
          workflowId,
          result: { success: true }
        },
        metadata: { correlationId },
        timestamp: new Date()
      });

      const result = await stateManager.executeQuery({
        id: uuidv4(),
        type: 'GetWorkflow',
        criteria: { workflowId },
        metadata: { correlationId }
      });

      expect(result.data.status).toBe(WorkflowStatus.COMPLETED);
      expect(result.data.completedAt).toBeDefined();
    });

    it('should list active workflows', async () => {
      const correlationId = uuidv4();

      const workflowIds = [uuidv4(), uuidv4(), uuidv4()];

      for (const id of workflowIds) {
        await stateManager.executeCommand({
          id: uuidv4(),
          type: 'CreateWorkflow',
          payload: {
            id,
            name: `Workflow ${id}`
          },
          metadata: { correlationId },
          timestamp: new Date()
        });

        await stateManager.executeCommand({
          id: uuidv4(),
          type: 'UpdateWorkflowStatus',
          payload: {
            workflowId: id,
            status: WorkflowStatus.RUNNING
          },
          metadata: { correlationId },
          timestamp: new Date()
        });
      }

      const result = await stateManager.executeQuery({
        id: uuidv4(),
        type: 'GetActiveWorkflows',
        criteria: {},
        metadata: { correlationId }
      });

      expect(result.data).toHaveLength(3);
      expect(result.data.every((w: any) => w.status === WorkflowStatus.RUNNING)).toBe(true);
    });
  });

  describe('Task Management', () => {
    let workflowId: string;
    let correlationId: string;

    beforeEach(async () => {
      workflowId = uuidv4();
      correlationId = uuidv4();

      await stateManager.executeCommand({
        id: uuidv4(),
        type: 'CreateWorkflow',
        payload: {
          id: workflowId,
          name: 'Test Workflow'
        },
        metadata: { correlationId },
        timestamp: new Date()
      });
    });

    it('should create a task', async () => {
      const taskId = uuidv4();

      await stateManager.executeCommand({
        id: uuidv4(),
        type: 'CreateTask',
        payload: {
          id: taskId,
          workflowId,
          agentName: 'test-agent',
          complexity: ComplexityLevel.MODERATE,
          description: 'Test task',
          priority: 5
        },
        metadata: { correlationId, workflowId },
        timestamp: new Date()
      });

      const result = await stateManager.executeQuery({
        id: uuidv4(),
        type: 'GetTask',
        criteria: { taskId },
        metadata: { correlationId }
      });

      expect(result.data).toBeDefined();
      expect(result.data.id).toBe(taskId);
      expect(result.data.workflowId).toBe(workflowId);
      expect(result.data.agentName).toBe('test-agent');
      expect(result.data.status).toBe(TaskStatus.PENDING);
      expect(result.data.priority).toBe(5);
    });

    it('should update task status', async () => {
      const taskId = uuidv4();

      await stateManager.executeCommand({
        id: uuidv4(),
        type: 'CreateTask',
        payload: {
          id: taskId,
          workflowId,
          agentName: 'test-agent',
          description: 'Test task'
        },
        metadata: { correlationId, workflowId },
        timestamp: new Date()
      });

      await stateManager.executeCommand({
        id: uuidv4(),
        type: 'UpdateTaskStatus',
        payload: {
          taskId,
          status: TaskStatus.IN_PROGRESS
        },
        metadata: { correlationId },
        timestamp: new Date()
      });

      const result = await stateManager.executeQuery({
        id: uuidv4(),
        type: 'GetTask',
        criteria: { taskId },
        metadata: { correlationId }
      });

      expect(result.data.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('should handle task completion with output', async () => {
      const taskId = uuidv4();

      await stateManager.executeCommand({
        id: uuidv4(),
        type: 'CreateTask',
        payload: {
          id: taskId,
          workflowId,
          agentName: 'test-agent',
          description: 'Test task'
        },
        metadata: { correlationId, workflowId },
        timestamp: new Date()
      });

      await stateManager.executeCommand({
        id: uuidv4(),
        type: 'UpdateTaskStatus',
        payload: {
          taskId,
          status: TaskStatus.COMPLETED,
          output: { result: 'success' }
        },
        metadata: { correlationId },
        timestamp: new Date()
      });

      const result = await stateManager.executeQuery({
        id: uuidv4(),
        type: 'GetTask',
        criteria: { taskId },
        metadata: { correlationId }
      });

      expect(result.data.status).toBe(TaskStatus.COMPLETED);
      expect(result.data.output).toEqual({ result: 'success' });
      expect(result.data.completedAt).toBeDefined();
    });

    it('should handle task failure with error', async () => {
      const taskId = uuidv4();

      await stateManager.executeCommand({
        id: uuidv4(),
        type: 'CreateTask',
        payload: {
          id: taskId,
          workflowId,
          agentName: 'test-agent',
          description: 'Test task'
        },
        metadata: { correlationId, workflowId },
        timestamp: new Date()
      });

      await stateManager.executeCommand({
        id: uuidv4(),
        type: 'UpdateTaskStatus',
        payload: {
          taskId,
          status: TaskStatus.FAILED,
          error: 'Task failed due to error'
        },
        metadata: { correlationId },
        timestamp: new Date()
      });

      const result = await stateManager.executeQuery({
        id: uuidv4(),
        type: 'GetTask',
        criteria: { taskId },
        metadata: { correlationId }
      });

      expect(result.data.status).toBe(TaskStatus.FAILED);
      expect(result.data.error).toBe('Task failed due to error');
    });

    it('should retrieve task queue', async () => {
      const taskIds = [uuidv4(), uuidv4(), uuidv4()];
      const priorities = [1, 5, 3];

      for (let i = 0; i < taskIds.length; i++) {
        await stateManager.executeCommand({
          id: uuidv4(),
          type: 'CreateTask',
          payload: {
            id: taskIds[i],
            workflowId,
            agentName: `agent-${i}`,
            description: `Task ${i}`,
            priority: priorities[i]
          },
          metadata: { correlationId, workflowId },
          timestamp: new Date()
        });
      }

      const result = await stateManager.executeQuery({
        id: uuidv4(),
        type: 'GetTaskQueue',
        criteria: {},
        metadata: { correlationId }
      });

      expect(result.data).toHaveLength(3);
      expect(result.data[0].priority).toBe(5);
      expect(result.data[1].priority).toBe(3);
      expect(result.data[2].priority).toBe(1);
    });
  });

  describe('Agent Management', () => {
    let workflowId: string;
    let taskId: string;
    let correlationId: string;

    beforeEach(async () => {
      workflowId = uuidv4();
      taskId = uuidv4();
      correlationId = uuidv4();

      await stateManager.executeCommand({
        id: uuidv4(),
        type: 'CreateWorkflow',
        payload: {
          id: workflowId,
          name: 'Test Workflow'
        },
        metadata: { correlationId },
        timestamp: new Date()
      });

      await stateManager.executeCommand({
        id: uuidv4(),
        type: 'CreateTask',
        payload: {
          id: taskId,
          workflowId,
          agentName: 'test-agent',
          description: 'Test task'
        },
        metadata: { correlationId, workflowId },
        timestamp: new Date()
      });
    });

    it('should assign agent to task', async () => {
      await stateManager.executeCommand({
        id: uuidv4(),
        type: 'AssignAgent',
        payload: {
          agentName: 'test-agent',
          taskId,
          workflowId
        },
        metadata: { correlationId },
        timestamp: new Date()
      });

      const result = await stateManager.executeQuery({
        id: uuidv4(),
        type: 'GetAgent',
        criteria: { agentName: 'test-agent' },
        metadata: { correlationId }
      });

      expect(result.data).toBeDefined();
      expect(result.data.name).toBe('test-agent');
      expect(result.data.currentTaskId).toBe(taskId);
      expect(result.data.status).toBe(AgentStatus.EXECUTING);
    });

    it('should update agent status', async () => {
      await stateManager.executeCommand({
        id: uuidv4(),
        type: 'AssignAgent',
        payload: {
          agentName: 'test-agent',
          taskId,
          workflowId
        },
        metadata: { correlationId },
        timestamp: new Date()
      });

      await stateManager.executeCommand({
        id: uuidv4(),
        type: 'UpdateAgentStatus',
        payload: {
          agentName: 'test-agent',
          status: AgentStatus.COMPLETED
        },
        metadata: { correlationId },
        timestamp: new Date()
      });

      const result = await stateManager.executeQuery({
        id: uuidv4(),
        type: 'GetAgent',
        criteria: { agentName: 'test-agent' },
        metadata: { correlationId }
      });

      expect(result.data.status).toBe(AgentStatus.COMPLETED);
      expect(result.data.successCount).toBe(1);
      expect(result.data.currentTaskId).toBeUndefined();
    });

    it('should track agent metrics', async () => {
      await stateManager.executeCommand({
        id: uuidv4(),
        type: 'AssignAgent',
        payload: {
          agentName: 'test-agent',
          taskId,
          workflowId
        },
        metadata: { correlationId },
        timestamp: new Date()
      });

      await stateManager.executeCommand({
        id: uuidv4(),
        type: 'UpdateAgentStatus',
        payload: {
          agentName: 'test-agent',
          status: AgentStatus.FAILED
        },
        metadata: { correlationId },
        timestamp: new Date()
      });

      const result = await stateManager.executeQuery({
        id: uuidv4(),
        type: 'GetAgent',
        criteria: { agentName: 'test-agent' },
        metadata: { correlationId }
      });

      expect(result.data.executionCount).toBe(1);
      expect(result.data.failureCount).toBe(1);
      expect(result.data.successCount).toBe(0);
    });

    it('should calculate agent utilization', async () => {
      const agentNames = ['agent-1', 'agent-2', 'agent-3'];

      for (let i = 0; i < agentNames.length; i++) {
        const agentTaskId = uuidv4();

        await stateManager.executeCommand({
          id: uuidv4(),
          type: 'CreateTask',
          payload: {
            id: agentTaskId,
            workflowId,
            agentName: agentNames[i],
            description: `Task for ${agentNames[i]}`
          },
          metadata: { correlationId, workflowId },
          timestamp: new Date()
        });

        await stateManager.executeCommand({
          id: uuidv4(),
          type: 'AssignAgent',
          payload: {
            agentName: agentNames[i],
            taskId: agentTaskId,
            workflowId
          },
          metadata: { correlationId },
          timestamp: new Date()
        });

        if (i === 1) {
          await stateManager.executeCommand({
            id: uuidv4(),
            type: 'UpdateAgentStatus',
            payload: {
              agentName: agentNames[i],
              status: AgentStatus.READY
            },
            metadata: { correlationId },
            timestamp: new Date()
          });
        }
      }

      const result = await stateManager.executeQuery({
        id: uuidv4(),
        type: 'GetAgentUtilization',
        criteria: {},
        metadata: { correlationId }
      });

      expect(result.data).toBeDefined();
      expect(result.data.get('agent-1')).toBe(1.0);
      expect(result.data.get('agent-2')).toBe(0.5);
      expect(result.data.get('agent-3')).toBe(1.0);
    });
  });

  describe('Query Operations', () => {
    let correlationId: string;

    beforeEach(async () => {
      correlationId = uuidv4();

      const statuses = [
        WorkflowStatus.PENDING,
        WorkflowStatus.RUNNING,
        WorkflowStatus.COMPLETED,
        WorkflowStatus.FAILED
      ];

      for (let i = 0; i < 4; i++) {
        const workflowId = uuidv4();

        await stateManager.executeCommand({
          id: uuidv4(),
          type: 'CreateWorkflow',
          payload: {
            id: workflowId,
            name: `Workflow ${i}`
          },
          metadata: { correlationId },
          timestamp: new Date()
        });

        if (i > 0) {
          await stateManager.executeCommand({
            id: uuidv4(),
            type: 'UpdateWorkflowStatus',
            payload: {
              workflowId,
              status: statuses[i]
            },
            metadata: { correlationId },
            timestamp: new Date()
          });
        }
      }
    });

    it('should filter workflows by status', async () => {
      const result = await stateManager.executeQuery({
        id: uuidv4(),
        type: 'GetWorkflowsByStatus',
        criteria: { status: WorkflowStatus.RUNNING },
        metadata: { correlationId }
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe(WorkflowStatus.RUNNING);
    });

    it('should retrieve system metrics', async () => {
      const result = await stateManager.executeQuery({
        id: uuidv4(),
        type: 'GetMetrics',
        criteria: {},
        metadata: { correlationId }
      });

      expect(result.data).toBeDefined();
      expect(result.data.totalWorkflows).toBe(4);
      expect(result.data.activeWorkflows).toBe(2);
      expect(result.data.completedWorkflows).toBe(2);
      expect(result.data.failedWorkflows).toBe(1);
    });
  });

  describe('Observable Streams', () => {
    it('should emit state changes', async () => {
      const workflowId = uuidv4();
      const correlationId = uuidv4();

      let emittedWorkflow: WorkflowState | undefined;
      const subscription = stateManager.getWorkflowObservable(workflowId).subscribe({
        next: (workflow) => {
          emittedWorkflow = workflow;
        }
      });

      await stateManager.executeCommand({
        id: uuidv4(),
        type: 'CreateWorkflow',
        payload: {
          id: workflowId,
          name: 'Observable Test'
        },
        metadata: { correlationId },
        timestamp: new Date()
      });

      // Wait for the observable to emit
      await new Promise(resolve => setTimeout(resolve, 200));
      expect(emittedWorkflow).toBeDefined();
      expect(emittedWorkflow?.status).toBe(WorkflowStatus.PENDING);

      await stateManager.executeCommand({
        id: uuidv4(),
        type: 'UpdateWorkflowStatus',
        payload: {
          workflowId,
          status: WorkflowStatus.RUNNING
        },
        metadata: { correlationId },
        timestamp: new Date()
      });

      // Wait for the observable to emit the updated state
      await new Promise(resolve => setTimeout(resolve, 200));
      expect(emittedWorkflow?.status).toBe(WorkflowStatus.RUNNING);

      subscription.unsubscribe();
    });

    it('should emit metrics changes', async () => {
      const correlationId = uuidv4();

      let metricsEmissions: SystemMetrics[] = [];
      const subscription = stateManager.getMetricsObservable().subscribe({
        next: (metrics) => {
          metricsEmissions.push(metrics);
        }
      });

      // Get initial metrics
      await new Promise(resolve => setTimeout(resolve, 100));
      const initialWorkflowCount = metricsEmissions[metricsEmissions.length - 1]?.totalWorkflows || 0;

      await stateManager.executeCommand({
        id: uuidv4(),
        type: 'CreateWorkflow',
        payload: {
          id: uuidv4(),
          name: 'Metrics Test'
        },
        metadata: { correlationId },
        timestamp: new Date()
      });

      // Wait for metrics to update
      await new Promise(resolve => setTimeout(resolve, 200));

      const finalMetrics = metricsEmissions[metricsEmissions.length - 1];
      expect(finalMetrics).toBeDefined();
      expect(finalMetrics.totalWorkflows).toBeGreaterThan(initialWorkflowCount);

      subscription.unsubscribe();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid command type', async () => {
      const command: Command = {
        id: uuidv4(),
        type: 'InvalidCommand',
        payload: {},
        metadata: {
          correlationId: uuidv4()
        },
        timestamp: new Date()
      };

      await expect(stateManager.executeCommand(command)).rejects.toThrow(
        'No handler registered for command type: InvalidCommand'
      );
    });

    it('should handle invalid query type', async () => {
      const query: Query = {
        id: uuidv4(),
        type: 'InvalidQuery',
        criteria: {},
        metadata: {
          correlationId: uuidv4()
        }
      };

      await expect(stateManager.executeQuery(query)).rejects.toThrow(
        'No handler registered for query type: InvalidQuery'
      );
    });

    it('should handle non-existent workflow query', async () => {
      const result = await stateManager.executeQuery({
        id: uuidv4(),
        type: 'GetWorkflow',
        criteria: { workflowId: uuidv4() },
        metadata: {
          correlationId: uuidv4()
        }
      });

      expect(result.data).toBeUndefined();
    });

    it('should handle non-existent task query', async () => {
      const result = await stateManager.executeQuery({
        id: uuidv4(),
        type: 'GetTask',
        criteria: { taskId: uuidv4() },
        metadata: {
          correlationId: uuidv4()
        }
      });

      expect(result.data).toBeUndefined();
    });
  });
});