import { Observable } from 'rxjs';
import WebSocket from 'ws';
import { z } from 'zod';
import { ExecutionEvent, ExecutionContext, TaskExecution } from '../execution/types';
import { WorkflowId, TaskId, AgentName } from '../state/types';

// =====================
// Integration Status
// =====================

export enum IntegrationStatus {
  STOPPED = 'stopped',
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
  ERROR = 'error',
}

// =====================
// WebSocket Protocol Types
// =====================

export enum MessageType {
  // Connection lifecycle
  CONNECT = 'connect',
  CONNECTED = 'connected',
  DISCONNECT = 'disconnect',
  PING = 'ping',
  PONG = 'pong',

  // Workflow operations
  EXECUTE_WORKFLOW = 'execute_workflow',
  WORKFLOW_STATUS = 'workflow_status',
  WORKFLOW_STARTED = 'workflow_started',
  WORKFLOW_COMPLETED = 'workflow_completed',
  WORKFLOW_FAILED = 'workflow_failed',

  // Task operations
  TASK_CREATED = 'task_created',
  TASK_STARTED = 'task_started',
  TASK_COMPLETED = 'task_completed',
  TASK_FAILED = 'task_failed',
  TASK_PROGRESS = 'task_progress',

  // Execution streaming
  EXECUTION_EVENT = 'execution_event',
  EXECUTION_METRICS = 'execution_metrics',
  EXECUTION_LOG = 'execution_log',

  // Hook operations
  HOOK_REGISTER = 'hook_register',
  HOOK_EXECUTE = 'hook_execute',
  HOOK_RESULT = 'hook_result',

  // Control operations
  PAUSE_WORKFLOW = 'pause_workflow',
  RESUME_WORKFLOW = 'resume_workflow',
  CANCEL_WORKFLOW = 'cancel_workflow',

  // Error handling
  ERROR = 'error',
  WARNING = 'warning',

  // Subscription management
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
  SUBSCRIPTION_CONFIRMED = 'subscription_confirmed',
}

// =====================
// Base Message Structure
// =====================

export interface BaseMessage {
  id: string;
  type: MessageType;
  timestamp: Date;
  correlationId?: string;
  replyTo?: string;
}

export interface RequestMessage<T = unknown> extends BaseMessage {
  payload: T;
}

export interface ResponseMessage<T = unknown> extends BaseMessage {
  payload: T;
  success: boolean;
  error?: string;
}

export interface EventMessage<T = unknown> extends BaseMessage {
  event: string;
  payload: T;
}

// =====================
// Connection Messages
// =====================

export const ConnectRequestSchema = z.object({
  version: z.string(),
  clientId: z.string(),
  capabilities: z.array(z.string()),
  // Authentication fields
  apiKey: z.string().optional(),
  token: z.string().optional(),
  clientSecret: z.string().optional(),
  authentication: z.object({
    type: z.enum(['none', 'token', 'certificate', 'apiKey', 'clientSecret']),
    credentials: z.any().optional(),
  }).optional(),
  preferences: z.object({
    compression: z.boolean().default(false),
    binaryMode: z.boolean().default(false),
    heartbeatInterval: z.number().default(30000),
  }).optional(),
});

export type ConnectRequest = z.infer<typeof ConnectRequestSchema>;

export const ConnectedResponseSchema = z.object({
  sessionId: z.string(),
  serverVersion: z.string(),
  supportedFeatures: z.array(z.string()),
  serverCapabilities: z.object({
    maxConcurrentWorkflows: z.number(),
    maxStreamsPerConnection: z.number(),
    supportedHookVersions: z.array(z.string()),
  }),
  connectionConfig: z.object({
    heartbeatInterval: z.number(),
    maxMessageSize: z.number(),
    compressionEnabled: z.boolean(),
  }),
});

export type ConnectedResponse = z.infer<typeof ConnectedResponseSchema>;

// =====================
// Workflow Messages
// =====================

export const ExecuteWorkflowRequestSchema = z.object({
  workflowType: z.string(),
  taskDescription: z.string(),
  projectDirectory: z.string().optional(),
  complexity: z.enum(['simple', 'moderate', 'complex']).optional(),
  parameters: z.record(z.any()).optional(),
  options: z.object({
    streamExecution: z.boolean().default(true),
    includeMetrics: z.boolean().default(true),
    includeLogs: z.boolean().default(false),
  }).optional(),
});

export type ExecuteWorkflowRequest = z.infer<typeof ExecuteWorkflowRequestSchema>;

export const WorkflowStatusSchema = z.object({
  workflowId: z.string(),
  status: z.enum(['pending', 'running', 'paused', 'completed', 'failed', 'cancelled']),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  currentTask: z.object({
    taskId: z.string(),
    agentName: z.string(),
    status: z.string(),
  }).optional(),
  progress: z.object({
    completed: z.number(),
    total: z.number(),
    percentage: z.number(),
  }),
  metrics: z.object({
    executionTime: z.number(),
    tasksCompleted: z.number(),
    errorCount: z.number(),
  }).optional(),
});

export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

// =====================
// Task Messages
// =====================

export const TaskProgressSchema = z.object({
  taskId: z.string(),
  workflowId: z.string(),
  agentName: z.string(),
  stage: z.string(),
  progress: z.number().min(0).max(100),
  message: z.string().optional(),
  estimatedCompletion: z.date().optional(),
  metrics: z.object({
    startTime: z.date(),
    elapsedTime: z.number(),
    estimatedRemainingTime: z.number().optional(),
  }).optional(),
});

export type TaskProgress = z.infer<typeof TaskProgressSchema>;

// =====================
// Subscription Messages
// =====================

export enum SubscriptionType {
  WORKFLOW_EXECUTION = 'workflow_execution',
  TASK_PROGRESS = 'task_progress',
  EXECUTION_METRICS = 'execution_metrics',
  SYSTEM_LOGS = 'system_logs',
  HOOK_EVENTS = 'hook_events',
  STATE_CHANGES = 'state_changes',
}

export const SubscribeRequestSchema = z.object({
  subscriptionType: z.nativeEnum(SubscriptionType),
  filters: z.object({
    workflowId: z.string().optional(),
    taskId: z.string().optional(),
    agentName: z.string().optional(),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).optional(),
    eventTypes: z.array(z.string()).optional(),
  }).optional(),
  options: z.object({
    includeHistory: z.boolean().default(false),
    maxEvents: z.number().default(1000),
    bufferTime: z.number().default(100),
  }).optional(),
});

export type SubscribeRequest = z.infer<typeof SubscribeRequestSchema>;

// =====================
// Hook System Types
// =====================

export interface HookDefinition {
  name: string;
  version: string;
  description: string;
  inputSchema: z.ZodSchema;
  outputSchema: z.ZodSchema;
  metadata: {
    author: string;
    tags: string[];
    documentation?: string;
  };
}

export interface HookImplementation {
  definition: HookDefinition;
  handler: (input: any, context: HookExecutionContext) => Promise<any>;
  middleware?: HookMiddleware[];
}

export interface HookExecutionContext {
  hookName: string;
  executionId: string;
  workflowId?: WorkflowId;
  taskId?: TaskId;
  correlationId: string;
  timestamp: Date;
  clientInfo: {
    sessionId: string;
    clientId: string;
    version: string;
  };
}

export interface HookMiddleware {
  name: string;
  execute: (input: any, context: HookExecutionContext, next: () => Promise<any>) => Promise<any>;
}

export const HookRegistrationSchema = z.object({
  name: z.string(),
  version: z.string(),
  implementation: z.object({
    type: z.enum(['javascript', 'typescript', 'wasm']),
    code: z.string(),
    entryPoint: z.string(),
    dependencies: z.array(z.string()).optional(),
  }),
  metadata: z.object({
    description: z.string(),
    author: z.string(),
    tags: z.array(z.string()).default([]),
    documentation: z.string().optional(),
  }),
  compatibility: z.object({
    minServerVersion: z.string(),
    maxServerVersion: z.string().optional(),
    requiredFeatures: z.array(z.string()).default([]),
  }).optional(),
});

export type HookRegistration = z.infer<typeof HookRegistrationSchema>;

// =====================
// Connection Management Types
// =====================

export interface WebSocketConnection {
  id: string;
  socket: WebSocket;
  sessionId: string;
  clientId: string;
  version: string;
  capabilities: string[];
  connectedAt: Date;
  lastActivity: Date;
  subscriptions: Map<string, Subscription>;
  isAuthenticated: boolean;
  authToken?: any; // AuthToken from auth module
  metadata: Record<string, any>;
}

export interface Subscription {
  id: string;
  type: SubscriptionType;
  filters: Record<string, any>;
  options: Record<string, any>;
  stream: Observable<any>;
  lastEvent?: Date;
  eventCount: number;
}

// =====================
// Stream Management Types
// =====================

export interface StreamDefinition {
  id: string;
  name: string;
  source: Observable<any>;
  subscribers: Set<string>; // connection IDs
  isActive: boolean;
  createdAt: Date;
  metadata: {
    workflowId?: WorkflowId;
    taskId?: TaskId;
    description?: string;
  };
}

export interface StreamManager {
  createStream(definition: Omit<StreamDefinition, 'id' | 'subscribers' | 'isActive' | 'createdAt'>): string;
  getStream(streamId: string): StreamDefinition | undefined;
  subscribeToStream(streamId: string, connectionId: string): Observable<any>;
  unsubscribeFromStream(streamId: string, connectionId: string): void;
  removeStream(streamId: string): void;
  listStreams(): StreamDefinition[];
  getConnectionStreams(connectionId: string): StreamDefinition[];
}

// =====================
// Integration Events
// =====================

export interface IntegrationEvent {
  id: string;
  type: string;
  source: 'websocket' | 'execution_engine' | 'state_manager' | 'hook_system';
  timestamp: Date;
  payload: any;
  metadata: {
    connectionId?: string;
    workflowId?: WorkflowId;
    correlationId?: string;
  };
}

// =====================
// Error Types
// =====================

export enum IntegrationErrorCode {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  AUTHORIZATION_FAILED = 'AUTHORIZATION_FAILED',
  PROTOCOL_ERROR = 'PROTOCOL_ERROR',
  SUBSCRIPTION_FAILED = 'SUBSCRIPTION_FAILED',
  HOOK_EXECUTION_FAILED = 'HOOK_EXECUTION_FAILED',
  STREAM_ERROR = 'STREAM_ERROR',
  VERSION_MISMATCH = 'VERSION_MISMATCH',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  SERVER_OVERLOADED = 'SERVER_OVERLOADED',
  MESSAGE_TIMEOUT = 'MESSAGE_TIMEOUT',
}

export class IntegrationError extends Error {
  public code: IntegrationErrorCode;
  public details?: any;
  public correlationId?: string;
  public timestamp: Date;

  constructor(message: string, code: IntegrationErrorCode, details?: any, correlationId?: string) {
    super(message);
    this.name = 'IntegrationError';
    this.code = code;
    this.details = details;
    this.correlationId = correlationId;
    this.timestamp = new Date();

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, IntegrationError);
    }
  }
}

// =====================
// Configuration Types
// =====================

export interface WebSocketServerConfig {
  port: number;
  host?: string;
  path?: string;
  maxConnections: number;
  maxStreamsPerConnection: number;
  heartbeatInterval: number;
  connectionTimeout: number;
  messageTimeout: number;
  maxMessageSize: number;
  compression: boolean;
  authentication: {
    enabled: boolean;
    providers: string[];
  };
  rateLimit: {
    enabled: boolean;
    maxRequestsPerMinute: number;
    burstLimit: number;
  };
}

export interface IntegrationLayerConfig {
  websocket: WebSocketServerConfig;
  streaming: {
    bufferSize: number;
    backpressureThreshold: number;
    retryAttempts: number;
    retryDelay: number;
    maxStreamsPerConnection: number;
    streamTimeout: number;
    metricsInterval: number;
  };
  hooks: {
    maxConcurrentExecutions: number;
    executionTimeout: number;
    registrySize: number;
    versioningEnabled: boolean;
    enableSandbox: boolean;
    allowedPackages: string[];
    migrationEnabled: boolean;
  };
  monitoring: {
    metricsEnabled: boolean;
    loggingLevel: 'debug' | 'info' | 'warn' | 'error';
    performanceTracking: boolean;
  };
}