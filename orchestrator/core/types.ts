// Core type definitions for the orchestration system

export interface WorkflowAgent {
  name: string;
  description: string;
  timeout: string;
  required?: boolean;
}

export interface ParallelAgentGroup {
  type: 'parallel';
  description?: string;
  agents: WorkflowAgent[];
  timeout?: string;
}

export interface ConditionalAgentGroup {
  type: 'conditional';
  description: string;
  conditions: Record<string, WorkflowAgent | ParallelAgentGroup | ConditionalAgent>;
  timeout?: string;
}

export interface ConditionalAgent {
  agent: string;
  timeout?: string;
}

export type AgentExecution = WorkflowAgent | ParallelAgentGroup | ConditionalAgentGroup;

export interface WorkflowDefinition {
  name: string;
  description: string;
  use_case: string;
  agents: {
    sequence: AgentExecution[];
  };
  context: {
    template: string;
  };
  examples: string[];
}

export interface WorkflowState {
  id: string;
  workflowName: string;
  taskDescription: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  startTime: Date;
  endTime?: Date;
  currentStepIndex: number;
  stepStates: StepState[];
  context: Record<string, any>;
  error?: string;
}

export interface StepState {
  index: number;
  agentName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  result?: string;
  error?: string;
  agentTaskId?: string;
  retryCount?: number;
}

export interface AgentResult {
  success: boolean;
  result?: string;
  error?: string;
  duration: number;
}

export interface OrchestrationConfig {
  maxConcurrentAgents: number;
  defaultTimeout: number;
  retryAttempts: number;
  retryDelay: number;
  enableMetrics: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface WorkflowMetrics {
  workflowId: string;
  workflowName: string;
  totalDuration: number;
  stepDurations: Record<string, number>;
  successRate: number;
  errorCount: number;
  retryCount: number;
}

export interface ParsedCommand {
  workflowType: string;
  taskDescription: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, any>;
}

// File-based result storage types
export interface StructuredAgentResult {
  agent: string;
  timestamp: string;
  status: 'completed' | 'failed' | 'partial';
  stepIndex: number;
  workflowId: string;
  output: {
    result: string[];
    success: boolean;
  };
  artifacts?: Record<string, string>;
  handover?: {
    keyPoints: string[];
    instructions?: string;
    dependencies?: string[];
    data?: Record<string, any>;
  };
  metrics: ResultMetrics;
}

export interface HandoverData {
  forAgent?: string[];
  keyPoints: string[];
  dependencies?: string[];
  data?: Record<string, any>;
  instructions?: string;
}

export interface ResultMetrics {
  duration: number;
  tokensUsed?: number;
  filesCreated: number;
  linesOfCode?: number;
}

export interface ResultPaths {
  resultDir: string;
  resultFile: string;
  artifactsDir: string;
}

export interface PreviousResults {
  agent: string;
  stepIndex: number;
  resultPath: string;
  result: StructuredAgentResult;
  available: boolean;
}

export interface WorkflowResultIndex {
  workflow: string;
  agents: AgentResultEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentResultEntry {
  name: string;
  step: number;
  resultPath: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  artifacts?: string[];
  timestamp?: string;
  output?: string[];
}

// Unified workflow state for consolidated file management
export interface UnifiedWorkflowState {
  id: string;
  workflowType: string;
  status: string;
  agents: Record<string, {
    step: number;
    status: string;
    resultPath: string;
    timestamp: string;
    output: string[];
  }>;
  pendingTaskId?: string;
  timestamps: {
    start: string;
    end?: string;
  };
}

// Utility function type for text processing
export type TextSplitter = (text: string, maxLength?: number) => string[];