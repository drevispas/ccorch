import { Router, Response } from 'express';
import { z } from 'zod';
import {
  ValidatedRequest,
  validateRequestBody,
  validateRequestParams,
  validateRequestQuery,
  sendValidatedResponse
} from '../middleware/validation';
import {
  CreateWorkflowInputSchema,
  UpdateWorkflowInputSchema,
  UpdateTaskInputSchema,
  WorkflowStatusSchema,
  TaskStatusSchema,
} from '../../core/state/schemas';
import { EventDrivenStateManager } from '../../core/state/event-driven-state-manager';
import { WorkflowStatus, TaskStatus } from '../../core/state/types';
import { ServerLogger, LogLevel } from '../utils/logger';
import { LogContext } from '../../core/enums';

// Route parameter schemas
const WorkflowIdParamsSchema = z.object({
  workflowId: z.string().uuid(),
});

const TaskIdParamsSchema = z.object({
  workflowId: z.string().uuid(),
  taskId: z.string().uuid(),
});

// Query parameter schemas
const WorkflowListQuerySchema = z.object({
  status: WorkflowStatusSchema.optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  pageSize: z.string().regex(/^\d+$/).transform(Number).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

// Response schemas
const WorkflowResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  status: WorkflowStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  metadata: z.record(z.any()),
});

const TaskResponseSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  agentName: z.string(),
  status: TaskStatusSchema,
  description: z.string(),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  output: z.any().optional(),
  error: z.string().optional(),
});

const WorkflowListResponseSchema = z.object({
  workflows: z.array(WorkflowResponseSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});

export function createWorkflowRoutes(
  stateManager: EventDrivenStateManager | null,
  logger: ServerLogger | null
) {
  const router = Router();

  // List all workflows with optional filtering
  router.get(
    '/workflows',
    validateRequestQuery(WorkflowListQuerySchema as any),
    async (req: ValidatedRequest<any, any, typeof WorkflowListQuerySchema>, res: Response) => {
      try {
        if (!stateManager) {
          return res.status(503).json({ error: 'State manager not initialized' });
        }

        const { status, page = 1, pageSize = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

        const workflows = await stateManager.listWorkflows();

        const response = {
          workflows: workflows.map((w: any) => ({
            id: w.id,
            name: w.name,
            description: w.description,
            status: w.status,
            createdAt: w.createdAt.toISOString(),
            updatedAt: w.updatedAt.toISOString(),
            startedAt: w.startedAt?.toISOString(),
            completedAt: w.completedAt?.toISOString(),
            metadata: w.metadata,
          })),
          total: workflows.length,
          page,
          pageSize,
        };

        logger?.logWithContext(LogLevel.INFO, LogContext.SERVER, 'Listed workflows', { count: workflows.length });
        sendValidatedResponse(res, WorkflowListResponseSchema, response, logger || undefined, req.correlationId);
      } catch (error) {
        logger?.logWithContext(LogLevel.ERROR, LogContext.SERVER, 'Failed to list workflows', { error: String(error) });
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // Get a specific workflow
  router.get(
    '/workflows/:workflowId',
    validateRequestParams(WorkflowIdParamsSchema),
    async (req: ValidatedRequest<typeof WorkflowIdParamsSchema>, res: Response) => {
      try {
        if (!stateManager) {
          return res.status(503).json({ error: 'State manager not initialized' });
        }

        const { workflowId } = req.params;
        const workflow = await stateManager.getWorkflow(workflowId);

        if (!workflow) {
          return res.status(404).json({ error: 'Workflow not found' });
        }

        const response = {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          status: workflow.status,
          createdAt: workflow.createdAt.toISOString(),
          updatedAt: workflow.updatedAt.toISOString(),
          startedAt: workflow.startedAt?.toISOString(),
          completedAt: workflow.completedAt?.toISOString(),
          metadata: workflow.metadata,
        };

        logger?.logWithContext(LogLevel.INFO, LogContext.SERVER, 'Retrieved workflow', { workflowId });
        sendValidatedResponse(res, WorkflowResponseSchema, response, logger || undefined, req.correlationId);
      } catch (error) {
        logger?.logWithContext(LogLevel.ERROR, LogContext.SERVER, 'Failed to get workflow', { error: String(error) });
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // Create a new workflow
  router.post(
    '/workflows',
    validateRequestBody(CreateWorkflowInputSchema),
    async (req: ValidatedRequest<any, typeof CreateWorkflowInputSchema>, res: Response) => {
      try {
        if (!stateManager) {
          return res.status(503).json({ error: 'State manager not initialized' });
        }

        const { v4: uuidv4 } = require('uuid');
        const workflowId = uuidv4();
        const workflowData = {
          ...req.body,
          id: workflowId
        };
        await stateManager.createWorkflow(workflowData);
        const workflow = await stateManager.getWorkflow(workflowId);

        if (!workflow) {
          throw new Error('Failed to create workflow');
        }

        const response = {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          status: workflow.status,
          createdAt: workflow.createdAt.toISOString(),
          updatedAt: workflow.updatedAt.toISOString(),
          metadata: workflow.metadata,
        };

        logger?.logWithContext(LogLevel.INFO, LogContext.SERVER, 'Created workflow', { workflowId });
        sendValidatedResponse(res, WorkflowResponseSchema, response, logger || undefined, req.correlationId);
      } catch (error) {
        logger?.logWithContext(LogLevel.ERROR, LogContext.SERVER, 'Failed to create workflow', { error: String(error) });
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // Update a workflow
  router.patch(
    '/workflows/:workflowId',
    validateRequestParams(WorkflowIdParamsSchema),
    validateRequestBody(UpdateWorkflowInputSchema),
    async (
      req: ValidatedRequest<typeof WorkflowIdParamsSchema, typeof UpdateWorkflowInputSchema>,
      res: Response
    ) => {
      try {
        if (!stateManager) {
          return res.status(503).json({ error: 'State manager not initialized' });
        }

        const { workflowId } = req.params;
        const workflow = await stateManager.getWorkflow(workflowId);

        if (!workflow) {
          return res.status(404).json({ error: 'Workflow not found' });
        }

        if (req.body.status) {
          await stateManager.updateWorkflowStatus(workflowId, req.body.status);
        }

        if (req.body.context || req.body.variables || req.body.metadata) {
          await stateManager.updateWorkflow(workflowId, req.body);
        }

        const updatedWorkflow = await stateManager.getWorkflow(workflowId);
        if (!updatedWorkflow) {
          throw new Error('Failed to update workflow');
        }

        const response = {
          id: updatedWorkflow.id,
          name: updatedWorkflow.name,
          description: updatedWorkflow.description,
          status: updatedWorkflow.status,
          createdAt: updatedWorkflow.createdAt.toISOString(),
          updatedAt: updatedWorkflow.updatedAt.toISOString(),
          startedAt: updatedWorkflow.startedAt?.toISOString(),
          completedAt: updatedWorkflow.completedAt?.toISOString(),
          metadata: updatedWorkflow.metadata,
        };

        logger?.logWithContext(LogLevel.INFO, LogContext.SERVER, 'Updated workflow', { workflowId });
        sendValidatedResponse(res, WorkflowResponseSchema, response, logger || undefined, req.correlationId);
      } catch (error) {
        logger?.logWithContext(LogLevel.ERROR, LogContext.SERVER, 'Failed to update workflow', { error: String(error) });
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // Delete a workflow
  router.delete(
    '/workflows/:workflowId',
    validateRequestParams(WorkflowIdParamsSchema),
    async (req: ValidatedRequest<typeof WorkflowIdParamsSchema>, res: Response) => {
      try {
        if (!stateManager) {
          return res.status(503).json({ error: 'State manager not initialized' });
        }

        const { workflowId } = req.params;
        const workflow = await stateManager.getWorkflow(workflowId);

        if (!workflow) {
          return res.status(404).json({ error: 'Workflow not found' });
        }

        await stateManager.deleteWorkflow(workflowId);

        logger?.logWithContext(LogLevel.INFO, LogContext.SERVER, 'Deleted workflow', { workflowId });
        res.status(204).send();
      } catch (error) {
        logger?.logWithContext(LogLevel.ERROR, LogContext.SERVER, 'Failed to delete workflow', { error: String(error) });
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // Get tasks for a workflow
  router.get(
    '/workflows/:workflowId/tasks',
    validateRequestParams(WorkflowIdParamsSchema),
    async (req: ValidatedRequest<typeof WorkflowIdParamsSchema>, res: Response) => {
      try {
        if (!stateManager) {
          return res.status(503).json({ error: 'State manager not initialized' });
        }

        const { workflowId } = req.params;
        const tasks = await stateManager.getTasksByWorkflow(workflowId);

        const response = tasks.map(t => ({
          id: t.id,
          workflowId: t.workflowId,
          agentName: t.agentName,
          status: t.status,
          description: t.description,
          createdAt: t.createdAt.toISOString(),
          startedAt: t.startedAt?.toISOString(),
          completedAt: t.completedAt?.toISOString(),
          output: t.output,
          error: t.error,
        }));

        logger?.logWithContext(LogLevel.INFO, LogContext.SERVER, 'Retrieved tasks for workflow', {
          workflowId,
          count: tasks.length,
        });
        res.json(response);
      } catch (error) {
        logger?.logWithContext(LogLevel.ERROR, LogContext.SERVER, 'Failed to get tasks', { error: String(error) });
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // Get a specific task
  router.get(
    '/workflows/:workflowId/tasks/:taskId',
    validateRequestParams(TaskIdParamsSchema),
    async (req: ValidatedRequest<typeof TaskIdParamsSchema>, res: Response) => {
      try {
        if (!stateManager) {
          return res.status(503).json({ error: 'State manager not initialized' });
        }

        const { workflowId, taskId } = req.params;
        const task = await stateManager.getTask(taskId);

        if (!task) {
          return res.status(404).json({ error: 'Task not found' });
        }

        const response = {
          id: task.id,
          workflowId: task.workflowId,
          agentName: task.agentName,
          status: task.status,
          description: task.description,
          createdAt: task.createdAt.toISOString(),
          startedAt: task.startedAt?.toISOString(),
          completedAt: task.completedAt?.toISOString(),
          output: task.output,
          error: task.error,
        };

        logger?.logWithContext(LogLevel.INFO, LogContext.SERVER, 'Retrieved task', { workflowId, taskId });
        sendValidatedResponse(res, TaskResponseSchema, response, logger || undefined, req.correlationId);
      } catch (error) {
        logger?.logWithContext(LogLevel.ERROR, LogContext.SERVER, 'Failed to get task', { error: String(error) });
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // Update a task
  router.patch(
    '/workflows/:workflowId/tasks/:taskId',
    validateRequestParams(TaskIdParamsSchema),
    validateRequestBody(UpdateTaskInputSchema),
    async (
      req: ValidatedRequest<typeof TaskIdParamsSchema, typeof UpdateTaskInputSchema>,
      res: Response
    ) => {
      try {
        if (!stateManager) {
          return res.status(503).json({ error: 'State manager not initialized' });
        }

        const { workflowId, taskId } = req.params;
        const task = await stateManager.getTask(taskId);

        if (!task) {
          return res.status(404).json({ error: 'Task not found' });
        }

        if (req.body.status) {
          await stateManager.updateTaskStatus(taskId, req.body.status);
        }

        if (req.body.output !== undefined || req.body.error !== undefined) {
          await stateManager.updateTask(taskId, req.body);
        }

        const updatedTask = await stateManager.getTask(taskId);
        if (!updatedTask) {
          throw new Error('Failed to update task');
        }

        const response = {
          id: updatedTask.id,
          workflowId: updatedTask.workflowId,
          agentName: updatedTask.agentName,
          status: updatedTask.status,
          description: updatedTask.description,
          createdAt: updatedTask.createdAt.toISOString(),
          startedAt: updatedTask.startedAt?.toISOString(),
          completedAt: updatedTask.completedAt?.toISOString(),
          output: updatedTask.output,
          error: updatedTask.error,
        };

        logger?.logWithContext(LogLevel.INFO, LogContext.SERVER, 'Updated task', { workflowId, taskId });
        sendValidatedResponse(res, TaskResponseSchema, response, logger || undefined, req.correlationId);
      } catch (error) {
        logger?.logWithContext(LogLevel.ERROR, LogContext.SERVER, 'Failed to update task', { error: String(error) });
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  return router;
}