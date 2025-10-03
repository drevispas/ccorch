#!/usr/bin/env node

/**
 * Orchestrator HTTP Server - TypeScript Implementation
 *
 * This server provides a type-safe integration bridge between Claude Code and the orchestrator.
 * It maintains workflow state and coordinates agent execution through validated HTTP endpoints.
 *
 * Key Features:
 * - Full TypeScript with comprehensive type safety
 * - Zod schema validation for all API contracts
 * - Request/response validation middleware
 * - OpenAPI documentation generation
 * - Type-safe client SDK support
 *
 * Architecture:
 * ```
 * [Claude Code] ↔ [Hooks] ↔ [HTTP Server] ↔ [Orchestrator Engine]
 *                                   ↓
 *                             [State Manager]
 * ```
 *
 * @module OrchestratorServer
 * @version 2.0.0
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { EventEmitter } from 'events';
import { z } from 'zod';
import { createServer } from 'http';

// Import core orchestrator components
import { Orchestrator } from '../core/orchestrator';
import { CommandParser } from '../core/command-parser';
import { WorkflowLoader } from '../core/workflow-loader';
import { AgentLoader } from '../core/agent-loader';
import { ResultFileManager } from '../core/result-file-manager';
import { HandoverChain } from '../core/handover-chain';
import { EventDrivenStateManager } from '../core/state/event-driven-state-manager';
import { ORCHESTRATOR_CONFIG } from '../core/config/constants';
import { detectComplexity, ComplexityDetector } from '../core/complexity-detector';

// Import execution and plugin components for WebSocket
import { ReactiveExecutionEngine } from '../core/execution/reactive-execution-engine';
import { PluginManager } from '../core/plugins/plugin-manager';
import { WorkflowCompiler } from '../core/workflow/compiler';

// Import WebSocket components
import { IntegrationWebSocketServer } from '../core/integration/websocket-server';
import { StreamingBridge } from '../core/integration/streaming-bridge';
import { HookManager } from '../core/integration/hook-manager';
import { WebSocketServerConfig } from '../core/integration/types';

// Import API routes
import { createApiRoutes } from './routes/api';

// Import schemas
import {
  WorkflowId,
  TaskId,
  WorkflowIdSchema,
  TaskIdSchema,
  ComplexityLevel,
  WorkflowStatus,
  TaskStatus,
  Todo,
  AgentType,
  WorkflowType
} from './schemas/common';

import {
  InitRequestSchema,
  ParseCommandRequestSchema,
  ExecuteWorkflowRequestSchema,
  AgentResultRequestSchema,
  InitResponseSchema,
  ParseCommandResponseSchema,
  ExecuteWorkflowResponseSchema,
  TodosResponseSchema,
  NextTodoResponseSchema,
  NextTaskResponseSchema,
  AgentResultResponseSchema,
  WorkflowStatusResponseSchema,
  WorkflowsListResponseSchema,
  HealthCheckResponseSchema,
  DebugWorkflowsResponseSchema,
  DebugWorkflowDetailResponseSchema,
  DebugTaskResponseSchema,
  RecoverWorkflowResponseSchema,
  ResetTaskResponseSchema,
  TaskParams
} from './schemas/api';

// Import middleware and utilities
import {
  ValidatedRequest,
  validateRequestBody,
  validateRequestParams,
  validateResponse,
  validationErrorHandler,
  sendValidatedResponse
} from './middleware/validation';
import { ServerLogger } from './utils/logger';
import { LogLevel, LogContext, WorkflowStatus as WorkflowStatusEnum } from '../core/enums';

// Import types
import {
  WorkflowState,
  PendingTask,
  ServerState,
  OrchestratorConfig,
  TodoWriteCallback,
  TaskCallback,
  TaskReadyEvent,
  ParsedCommand,
  ComplexityAnalysis
} from './types';

// =============================================================================
// Application Setup
// =============================================================================

const app = express();
const PORT = process.env.ORCHESTRATOR_PORT || 3001;
const WS_PORT = process.env.ORCHESTRATOR_WS_PORT || 3002;
const AGENT_EXECUTION_TIMEOUT = parseInt(process.env.AGENT_EXECUTION_TIMEOUT || '') ||
                                 ORCHESTRATOR_CONFIG.timeouts?.claudeIntegration?.agentExecutionTimeout ||
                                 120000;

// Create HTTP server for both Express and WebSocket
const httpServer = createServer(app);

// =============================================================================
// Global State Management with Type Safety
// =============================================================================

let serverLogger: ServerLogger = new ServerLogger({
  logLevel: process.env.LOG_LEVEL || 'info',
  enableMetrics: true
});
let orchestratorInstance: Orchestrator | null = null;
let workflowLoader: WorkflowLoader | null = null;
let agentLoader: AgentLoader | null = null;
let commandParser: CommandParser | null = null;
let resultFileManager: ResultFileManager | null = null;
let handoverChain: HandoverChain | null = null;
let stateManager: EventDrivenStateManager | null = null;

// WebSocket components
let wsServer: IntegrationWebSocketServer | null = null;
let streamingBridge: StreamingBridge | null = null;
let hookManager: HookManager | null = null;

// Execution components for WebSocket
let executionEngine: ReactiveExecutionEngine | null = null;
let pluginManager: PluginManager | null = null;
let workflowCompiler: WorkflowCompiler | null = null;

// Type-safe server state
const serverState: ServerState = {
  activeWorkflows: new Map<string, WorkflowState>(),
  pendingTodos: new Map<string, Todo[]>(),
  pendingTasks: new Map<string, PendingTask>(),
  taskTimeouts: new Map<string, NodeJS.Timeout>(),
  taskNotifier: new EventEmitter(),
  currentWorkflowId: null
};

// =============================================================================
// Express Middleware Configuration
// =============================================================================

app.use(cors());
app.use(express.json());

// Correlation ID and request logging middleware
app.use((req: ValidatedRequest, res: Response, next: NextFunction) => {
  const correlationId = serverLogger?.generateCorrelationId() || `req_${Date.now()}`;
  req.correlationId = correlationId;

  const source = req.headers['user-agent']?.includes('curl') || req.path.startsWith('/api/')
    ? (req.headers.referer ? 'claude' : 'hook')
    : 'internal';

  if (serverLogger) {
    serverLogger.logRequest(req.method, req.path, correlationId);
  }

  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    if (serverLogger) {
      serverLogger.logResponse(req.method, req.path, res.statusCode, duration, correlationId);
    }
  });

  next();
});

// =============================================================================
// Helper Functions with Type Safety
// =============================================================================

function supportsComplexityVariants(agentType: string): boolean {
  const complexityEnabledAgents = [
    'backend-architect',
    'java-backend-developer',
    'nextjs-react-developer',
    'code-reviewer',
    'e2e-test-architect',
    'issue-detective'
  ];
  return complexityEnabledAgents.includes(agentType);
}

function getCurrentWorkflowId(): string | null {
  if (serverState.currentWorkflowId && serverState.activeWorkflows.has(serverState.currentWorkflowId)) {
    return serverState.currentWorkflowId;
  }

  const workflows = Array.from(serverState.activeWorkflows.entries());
  const runningWorkflow = workflows.find(([_, workflow]) => workflow.status === 'running');
  if (runningWorkflow) {
    return runningWorkflow[0];
  }

  return workflows.length > 0 ? workflows[workflows.length - 1][0] : null;
}

async function getNextPendingTask(workflowId: string): Promise<{
  taskId: string;
  params: TaskParams;
  timestamp: string;
} | null> {
  for (const [taskId, task] of serverState.pendingTasks) {
    if (task.workflowId === workflowId &&
        (task.status === 'pending' || task.status === 'awaiting_claude_execution')) {
      return {
        taskId,
        params: task.params,
        timestamp: task.timestamp
      };
    }
  }
  return null;
}

async function createNextTaskInSequence(
  workflowId: string,
  workflow: WorkflowState,
  completedAgentType: AgentType
): Promise<void> {
  try {
    const existingPendingTask = await getNextPendingTask(workflowId);
    if (existingPendingTask) {
      serverLogger?.logWithContext(LogLevel.WARN, LogContext.WORKFLOW, `Next task already exists for workflow ${workflowId}`, {
        taskId: existingPendingTask.taskId
      });
      return;
    }

    if (!workflowLoader) return;

    const workflowDefinition = await workflowLoader.loadWorkflow(workflow.workflowType);
    if (!workflowDefinition || !workflowDefinition.agents) {
      serverLogger?.logWithContext(LogLevel.ERROR, LogContext.WORKFLOW, `Invalid workflow definition for type ${workflow.workflowType}`);
      return;
    }
    const sequence = workflowDefinition.agents.sequence;

    const currentAgentIndex = sequence.findIndex(agent => agent.name === completedAgentType);
    if (currentAgentIndex === -1) {
      serverLogger?.logWithContext(LogLevel.WARN, LogContext.WORKFLOW, `Completed agent ${completedAgentType} not found in workflow sequence`);
      return;
    }

    const nextAgentIndex = currentAgentIndex + 1;
    if (nextAgentIndex >= sequence.length) {
      serverLogger?.workflowCompleted(workflowId as WorkflowId, Date.now() - new Date(workflow.startTime).getTime());
      workflow.status = 'completed';
      workflow.endTime = new Date().toISOString();
      serverState.activeWorkflows.set(workflowId, workflow);

      // Broadcast workflow completed event
      broadcastWorkflowEvent('completed', workflowId, {
        workflowType: workflow.workflowType,
        completedTasks: workflow.completedTasks,
        duration: new Date(workflow.endTime).getTime() - new Date(workflow.startTime).getTime(),
        endTime: workflow.endTime
      });

      if (stateManager) {
        await stateManager.updateWorkflowStatus(workflowId as WorkflowId, WorkflowStatusEnum.COMPLETED);
      }

      if (serverState.currentWorkflowId === workflowId) {
        serverState.currentWorkflowId = null;
      }
      return;
    }

    const nextAgent = sequence[nextAgentIndex];
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2)}` as TaskId;

    const taskParams: TaskParams = {
      subagent_type: nextAgent.name as AgentType,
      description: `Execute ${nextAgent.name} for workflow step ${nextAgentIndex + 1}`,
      prompt: workflow.taskDescription,
      projectDirectory: workflow.projectDirectory,
      complexity: workflow.complexity
    };

    serverState.pendingTasks.set(taskId, {
      workflowId: workflowId as WorkflowId,
      params: taskParams,
      timestamp: new Date().toISOString(),
      status: 'awaiting_claude_execution',
      promise: null,
      timeoutId: null
    });

    workflow.pendingTaskId = taskId;
    serverState.activeWorkflows.set(workflowId, workflow);

    serverState.taskNotifier.emit('taskReady', {
      taskId,
      workflowId,
      agentType: nextAgent.name
    });

    const timeoutObj = setTimeout(() => {
      const task = serverState.pendingTasks.get(taskId);
      if (task && (task.status === 'awaiting_claude_execution' || task.status === 'claude_executing')) {
        serverLogger?.logWithContext(LogLevel.WARN, LogContext.TASK, `Task timed out`, {
          taskId,
          agentName: nextAgent.name,
          duration: AGENT_EXECUTION_TIMEOUT
        });
        task.status = 'timeout';
        serverState.pendingTasks.set(taskId, task);
        serverState.taskTimeouts.delete(taskId);
      }
    }, AGENT_EXECUTION_TIMEOUT);

    serverState.taskTimeouts.set(taskId, timeoutObj);
  } catch (error) {
    serverLogger?.logWithContext(LogLevel.ERROR, LogContext.WORKFLOW, `Failed to create next task: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// =============================================================================
// WebSocket Helper Functions
// =============================================================================

function broadcastWorkflowEvent(eventType: string, workflowId: string, data: any): void {
  if (!wsServer) return;

  const message: any = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    type: `workflow:${eventType}`,
    timestamp: new Date(),
    payload: {
      workflowId,
      ...data
    }
  };
  wsServer.broadcast(message);
}

function broadcastTaskEvent(eventType: string, taskId: string, data: any): void {
  if (!wsServer) return;

  const message: any = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    type: `task:${eventType}`,
    timestamp: new Date(),
    payload: {
      taskId,
      ...data
    }
  };
  wsServer.broadcast(message);
}

function broadcastTodoUpdate(workflowId: string, todos: Todo[]): void {
  if (!wsServer) return;

  const message: any = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    type: 'todos:updated',
    timestamp: new Date(),
    payload: {
      workflowId,
      todos
    }
  };
  wsServer.broadcast(message);
}

// =============================================================================
// API Endpoints with Full Validation
// =============================================================================

// Initialize endpoint
app.post('/api/init',
  validateRequestBody(InitRequestSchema),
  async (req: ValidatedRequest<z.infer<typeof InitRequestSchema>>, res: Response) => {
    try {
      // Update logger configuration if provided
      if (req.validatedBody?.logLevel) {
        serverLogger = new ServerLogger({
          logLevel: req.validatedBody.logLevel,
          enableMetrics: req.validatedBody?.enableMetrics || true
        });
        await serverLogger.initialize();
      }

      serverLogger.logWithContext(LogLevel.INFO, LogContext.SERVER, 'Initializing orchestrator server...');

      // Initialize components
      workflowLoader = new WorkflowLoader();
      await workflowLoader.initialize();

      agentLoader = new AgentLoader();

      commandParser = new CommandParser();
      await commandParser.initialize();

      resultFileManager = new ResultFileManager('./results');
      await resultFileManager.initialize();

      handoverChain = new HandoverChain();

      // Initialize state manager
      stateManager = new EventDrivenStateManager();
      await stateManager.initialize();

      // Initialize components for WebSocket support
      try {
        // Initialize plugin manager
        pluginManager = new PluginManager({
          pluginsDir: './agents',
          enableAutoDiscovery: true,
          requireManifest: false,
          maxConcurrentLoads: 5,
          enableCaching: true
        });
        await pluginManager.initialize();

        // Initialize workflow compiler
        workflowCompiler = new WorkflowCompiler();

        // Initialize execution engine with all dependencies
        executionEngine = new ReactiveExecutionEngine({
          stateManager,
          pluginManager,
          workflowCompiler,
          config: {
            maxConcurrentTasks: 10,
            defaultTimeout: 60000,
            enableMetrics: true,
            enableDebug: false,
            enableCheckpointing: false
          },
          enableMonitoring: true
        });
        await executionEngine.initialize();

        // Initialize WebSocket components
        hookManager = new HookManager({
          maxConcurrentExecutions: 10,
          executionTimeout: 30000,
          registrySize: 100,
          versioningEnabled: false,
          enableSandbox: false,
          allowedPackages: [],
          migrationEnabled: false
        });

        // Create StreamingBridge with proper execution engine
        streamingBridge = new StreamingBridge(
          executionEngine,
          stateManager,
          {
            bufferSize: 1000,
            backpressureThreshold: 100,
            retryAttempts: 3,
            retryDelay: 1000,
            maxStreamsPerConnection: 10,
            streamTimeout: 60000,
            metricsInterval: 5000
          }
        );

        // Configure WebSocket server
        const wsConfig: WebSocketServerConfig = {
          port: Number(WS_PORT),
          host: '0.0.0.0',
          path: '/ws',
          heartbeatInterval: 30000,
          connectionTimeout: 60000,
          maxConnections: 100,
          maxStreamsPerConnection: 10,
          messageTimeout: 30000,
          maxMessageSize: 1024 * 1024, // 1MB
          compression: false,
          authentication: {
            enabled: false,
            providers: ['none']
          },
          rateLimit: {
            enabled: false,
            maxRequestsPerMinute: 100,
            burstLimit: 20
          }
        };

        // Create WebSocket server on separate port
        wsServer = new IntegrationWebSocketServer({
          // httpServer,  // Don't pass httpServer to use separate port 3002
          config: wsConfig,
          streamingBridge,
          hookManager
        });

        // Start WebSocket server
        await wsServer.start();
        serverLogger?.logWithContext(LogLevel.INFO, LogContext.SERVER,
          `WebSocket server started successfully on port ${WS_PORT}`);

      } catch (wsError) {
        serverLogger?.logWithContext(LogLevel.WARN, LogContext.SERVER,
          `WebSocket initialization failed: ${wsError instanceof Error ? wsError.message : 'Unknown error'}`);
        serverLogger?.logWithContext(LogLevel.INFO, LogContext.SERVER,
          'HTTP API will continue to work without WebSocket support');
      }

      // Create orchestrator with callbacks
      const todoWriteCallback: TodoWriteCallback = async (todos) => {
        const workflowId = getCurrentWorkflowId();
        if (workflowId) {
          serverState.pendingTodos.set(workflowId, todos);
          serverLogger?.logWithContext(LogLevel.INFO, LogContext.WORKFLOW, `Stored todos for workflow ${workflowId}`, {
            todoCount: todos.length
          });
          // Broadcast todo update via WebSocket
          broadcastTodoUpdate(workflowId, todos);
        }
      };

      const taskCallback: TaskCallback = async (params) => {
        const workflowId = getCurrentWorkflowId();
        if (workflowId) {
          const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2)}` as TaskId;

          serverLogger?.taskCreated(taskId, params.subagent_type as AgentType, workflowId as WorkflowId);

          // Broadcast task creation via WebSocket
          broadcastTaskEvent('created', taskId, {
            workflowId,
            agentType: params.subagent_type,
            description: params.description
          });

          serverState.pendingTasks.set(taskId, {
            workflowId: workflowId as WorkflowId,
            params,
            timestamp: new Date().toISOString(),
            status: 'awaiting_claude_execution',
            promise: null,
            timeoutId: null
          });

          const workflow = serverState.activeWorkflows.get(workflowId);
          if (workflow) {
            workflow.pendingTaskId = taskId;
            serverState.activeWorkflows.set(workflowId, workflow);
          }

          serverState.taskNotifier.emit('taskReady', {
            taskId,
            workflowId,
            agentType: params.subagent_type
          });

          const timeoutObj = setTimeout(() => {
            const task = serverState.pendingTasks.get(taskId);
            if (task && (task.status === 'awaiting_claude_execution' || task.status === 'claude_executing')) {
              serverLogger?.logWithContext(LogLevel.WARN, LogContext.TASK, `Task timed out`, {
                taskId,
                agentName: params.subagent_type,
                duration: AGENT_EXECUTION_TIMEOUT
              });
              task.status = 'timeout';
              serverState.pendingTasks.set(taskId, task);
              serverState.taskTimeouts.delete(taskId);
            }
          }, AGENT_EXECUTION_TIMEOUT);

          serverState.taskTimeouts.set(taskId, timeoutObj);

          return {
            success: true,
            result: `Task ${taskId} queued for asynchronous execution`,
            taskId,
            agentType: params.subagent_type,
            duration: 0
          };
        }
        throw new Error('No active workflow for task execution');
      };

      orchestratorInstance = new Orchestrator({
        logLevel: LogLevel.INFO,
        enableMetrics: true,
        maxConcurrentTasks: 3,
        todoWriteCallback: todoWriteCallback,
        taskCallback: taskCallback
      });

      await orchestratorInstance.initialize({});

      const response = {
        status: 'initialized' as const,
        availableWorkflows: await orchestratorInstance.getAvailableWorkflows() as WorkflowType[],
        timestamp: new Date().toISOString()
      };

      sendValidatedResponse(res, InitResponseSchema, response, serverLogger, req.correlationId);
    } catch (error) {
      serverLogger?.logWithContext(LogLevel.ERROR, LogContext.SERVER, `Failed to initialize orchestrator: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.status(500).json({
        error: 'Failed to initialize orchestrator',
        details: error instanceof Error ? error.message : 'Unknown error',
        correlationId: req.correlationId
      });
    }
  }
);

// Parse command endpoint
app.post('/api/parse-command',
  validateRequestBody(ParseCommandRequestSchema),
  async (req: ValidatedRequest<z.infer<typeof ParseCommandRequestSchema>>, res: Response) => {
    try {
      const { command } = req.validatedBody!;

      if (!commandParser) {
        return res.status(500).json({ error: 'Orchestrator not initialized' });
      }

      serverLogger?.logWithContext(LogLevel.DEBUG, LogContext.SERVER, `Parsing command: "${command}"`);

      const parsedCommand = commandParser.parseCommand(command);

      if (!parsedCommand) {
        const suggestions = commandParser.suggestWorkflows ? commandParser.suggestWorkflows(command) : [];
        const response = {
          success: false as const,
          error: 'Could not parse workflow command',
          suggestions: suggestions || []
        };
        return sendValidatedResponse(res, ParseCommandResponseSchema, response, serverLogger || undefined, req.correlationId);
      }

      const response = {
        success: true as const,
        parsedCommand: {
          workflowType: parsedCommand.workflowType as WorkflowType,
          taskDescription: parsedCommand.taskDescription,
          parameters: {}
        },
        available: true
      };

      sendValidatedResponse(res, ParseCommandResponseSchema, response, serverLogger || undefined, req.correlationId);
    } catch (error) {
      serverLogger?.logWithContext(LogLevel.ERROR, LogContext.SERVER, `Failed to parse command: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.status(500).json({
        error: 'Failed to parse command',
        details: error instanceof Error ? error.message : 'Unknown error',
        correlationId: req.correlationId
      });
    }
  }
);

// Execute workflow endpoint
app.post('/api/execute',
  validateRequestBody(ExecuteWorkflowRequestSchema),
  async (req: ValidatedRequest<z.infer<typeof ExecuteWorkflowRequestSchema>>, res: Response) => {
    try {
      const { workflowType, taskDescription, parsedCommand: providedCommand, projectDirectory, complexity } = req.validatedBody!;

      if (!orchestratorInstance) {
        return res.status(500).json({ error: 'Orchestrator not initialized' });
      }

      let detectedComplexity: ComplexityLevel = 'moderate';
      let complexityAnalysis: ComplexityAnalysis | undefined;

      if (complexity) {
        detectedComplexity = complexity;
      } else {
        const complexityDetector = new ComplexityDetector();
        complexityAnalysis = complexityDetector.analyzeComplexity(taskDescription);
        detectedComplexity = complexityAnalysis.level;
      }

      const workflowId = `wf_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      serverLogger?.workflowStarted(workflowId as WorkflowId, workflowType, taskDescription);
      serverLogger?.logWithContext(LogLevel.INFO, LogContext.WORKFLOW, `Task complexity: ${detectedComplexity}`);

      const workflowState: WorkflowState = {
        id: workflowId as WorkflowId,
        workflowType,
        taskDescription,
        status: 'starting',
        startTime: new Date().toISOString(),
        parsedCommand: providedCommand || { workflowType, taskDescription },
        pendingTaskId: null,
        completedTasks: [],
        currentWorkflowId: workflowId as WorkflowId,
        projectDirectory: projectDirectory || process.cwd(),
        complexity: detectedComplexity,
        complexityAnalysis
      };

      serverState.activeWorkflows.set(workflowId, workflowState);
      serverState.currentWorkflowId = workflowId;

      // Create a ParsedCommand for the Orchestrator
      const workflowCommand: ParsedCommand = {
        workflowType,
        taskDescription,
        projectDirectory,
        complexity: detectedComplexity
      };

      const executionPromise = orchestratorInstance.executeWorkflow(workflowCommand);

      workflowState.status = 'running';
      serverState.activeWorkflows.set(workflowId, workflowState);

      // Broadcast workflow started event
      broadcastWorkflowEvent('started', workflowId, {
        workflowType,
        taskDescription,
        complexity: detectedComplexity
      });

      executionPromise
        .then(result => {
          serverLogger?.logWithContext(LogLevel.INFO, LogContext.WORKFLOW, `Workflow ${workflowId} initialized`, { result });

          // Broadcast workflow completed event
          const workflow = serverState.activeWorkflows.get(workflowId);
          if (workflow) {
            broadcastWorkflowEvent('completed', workflowId, {
              workflowType,
              status: 'completed',
              duration: workflow.endTime ? Date.now() - new Date(workflow.startTime).getTime() : 0
            });
          }
        })
        .catch(error => {
          serverLogger?.logWithContext(LogLevel.ERROR, LogContext.WORKFLOW, `Workflow ${workflowId} initialization failed: ${error.message}`);
          const workflow = serverState.activeWorkflows.get(workflowId);
          if (workflow) {
            workflow.status = 'failed';
            workflow.endTime = new Date().toISOString();
            workflow.error = error.message;
            serverState.activeWorkflows.set(workflowId, workflow);

            // Broadcast workflow failed event
            broadcastWorkflowEvent('failed', workflowId, {
              workflowType,
              error: error.message,
              duration: Date.now() - new Date(workflow.startTime).getTime()
            });
          }
          if (serverState.currentWorkflowId === workflowId) {
            serverState.currentWorkflowId = null;
          }
        });

      const response = {
        workflowId: workflowId as WorkflowId,
        status: 'started' as const,
        workflowType,
        taskDescription
      };

      sendValidatedResponse(res, ExecuteWorkflowResponseSchema, response, serverLogger || undefined, req.correlationId);
    } catch (error) {
      serverLogger?.logWithContext(LogLevel.ERROR, LogContext.SERVER, `Failed to execute workflow: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.status(500).json({
        error: 'Failed to execute workflow',
        details: error instanceof Error ? error.message : 'Unknown error',
        correlationId: req.correlationId
      });
    }
  }
);

// Mount additional API routes from routes/api.ts
// This includes: todos, health, next-todo, next-task, agent-result, status, workflows, debug, recovery
const apiRoutes = createApiRoutes(
  serverState,
  serverLogger,
  resultFileManager,
  handoverChain,
  stateManager,
  orchestratorInstance,
  workflowLoader,
  AGENT_EXECUTION_TIMEOUT
);
app.use('/api', apiRoutes);

// Error handling middleware
app.use(validationErrorHandler);

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  serverLogger?.logWithContext(LogLevel.ERROR, LogContext.SERVER, `Server error: ${error.message}`, {
    stack: error.stack
  });
  res.status(500).json({
    error: 'Internal server error',
    details: error.message,
    correlationId: (req as ValidatedRequest).correlationId
  });
});

// Start server
if (require.main === module) {
  httpServer.listen(PORT, async () => {
    await serverLogger.initialize();
    serverLogger.logWithContext(LogLevel.INFO, LogContext.SERVER, `Orchestrator server running on port ${PORT}`);
    serverLogger.logWithContext(LogLevel.INFO, LogContext.SERVER, `Health check: http://localhost:${PORT}/api/health`);
    serverLogger.logWithContext(LogLevel.INFO, LogContext.SERVER, `WebSocket endpoint: ws://localhost:${WS_PORT}/ws`);
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  serverLogger?.logWithContext(LogLevel.INFO, LogContext.SERVER, 'Received SIGTERM, shutting down gracefully...');

  if (wsServer) {
    await wsServer.stop();
  }

  httpServer.close(() => {
    serverLogger?.logWithContext(LogLevel.INFO, LogContext.SERVER, 'Server closed');
    process.exit(0);
  });
});

export { app, httpServer, serverState, serverLogger, wsServer };