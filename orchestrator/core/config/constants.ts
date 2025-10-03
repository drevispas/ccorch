/**
 * Orchestrator Configuration Constants
 *
 * Centralized configuration to avoid magic numbers throughout the codebase.
 * All timeout values are in milliseconds.
 */

export const ORCHESTRATOR_CONFIG = {
  /**
   * Timeout configurations for workflows and agents
   */
  timeouts: {
    /** Default workflow timeout (30 minutes) */
    defaultWorkflow: 30 * 60 * 1000,
    /** Agent fallback mock response delay for testing */
    agentFallback: 500,
    /** Delay between retry attempts */
    retryDelay: 5000,
    /** Claude Code integration timeouts */
    claudeIntegration: {
      /** Timeout for Claude to execute agent tasks (10 minutes) */
      agentExecutionTimeout: 10 * 60 * 1000, // 600000ms
      /** HTTP request timeout for hook operations (3 seconds) */
      hookRequestTimeout: 3000,
      /** Health check timeout (1 second) */
      healthCheckTimeout: 1000,
      /** Debug endpoint timeout (2 seconds) */
      debugRequestTimeout: 2000,
    },
  },

  /**
   * Default orchestration settings
   */
  defaults: {
    /** Maximum number of concurrent agents */
    maxConcurrentAgents: 3,
    /** Number of retry attempts for failed operations */
    retryAttempts: 2,
    /** Default log level */
    logLevel: 'info' as const,
    /** Enable metrics collection by default */
    enableMetrics: true,
  },

  /**
   * Monitoring and logging configurations
   */
  monitoring: {
    /** Interval for flushing logs to file (30 seconds) */
    logFlushInterval: 30 * 1000,
    /** Maximum number of metrics to keep in memory */
    maxMetricsInMemory: 1000,
    /** Default execution time for mock workflows (30 seconds) */
    defaultExecutionTime: 30 * 1000,
    /** Maximum execution time for mock workflows (90 seconds) */
    maxExecutionTime: 90 * 1000,
    /** Maximum length for result truncation in logs */
    maxResultLength: 200,
    /** Maximum length for command truncation in logs */
    maxCommandLength: 100,
    /** Prompt truncation length for debug logs */
    promptTruncationLength: 100,
  },

  /**
   * Schema validation limits
   */
  validation: {
    /** Maximum workflow name length */
    maxWorkflowNameLength: 100,
    /** Maximum workflow description length */
    maxWorkflowDescriptionLength: 500,
    /** Maximum use case description length */
    maxUseCaseLength: 200,
    /** Maximum agent description length */
    maxAgentDescriptionLength: 2000,
    /** Maximum agent name length */
    maxAgentNameLength: 100,
    /** Minimum agent definition length */
    minAgentDefinitionLength: 100,
  },

  /**
   * Command parsing configurations
   */
  commandParsing: {
    /** Confidence threshold for workflow suggestions */
    minSuggestionConfidence: 10,
    /** Maximum number of workflow suggestions to return */
    maxSuggestions: 5,
    /** Maximum confidence score (percentage) */
    maxConfidence: 100,
    /** Use case matching weight in confidence calculation */
    useCaseWeight: 40,
    /** Example matching weight in confidence calculation */
    exampleWeight: 40,
    /** Description matching weight in confidence calculation */
    descriptionWeight: 20,
    /** Minimum use case match threshold for inclusion in reasons */
    minUseCaseMatchThreshold: 0.3,
    /** Minimum example match threshold for inclusion in reasons */
    minExampleMatchThreshold: 0.3,
    /** Minimum description match threshold for inclusion in reasons */
    minDescriptionMatchThreshold: 0.2,
    /** Maximum description words to consider for matching */
    maxDescriptionWords: 10,
  },

  /**
   * Performance and resource limits
   */
  performance: {
    /** Time unit conversions */
    timeUnits: {
      second: 1000,
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
    },
    /** Memory usage conversion factor (bytes to MB) */
    bytesToMB: 1024 * 1024,
    /** CPU usage conversion factor (microseconds to seconds) */
    microsecondsToSeconds: 1_000_000,
    /** Percentage calculation base */
    percentageBase: 100,
    /** Percentage precision for rounding */
    percentagePrecision: 100,
  },

  /**
   * Agent execution states
   */
  states: {
    workflow: {
      pending: 'pending',
      running: 'running',
      completed: 'completed',
      failed: 'failed',
      cancelled: 'cancelled',
    },
    step: {
      pending: 'pending',
      running: 'running',
      completed: 'completed',
      failed: 'failed',
      skipped: 'skipped',
    },
    priority: {
      low: 'low',
      medium: 'medium',
      high: 'high',
      critical: 'critical',
    },
  },
} as const;

/**
 * Type definitions for configuration values
 */
export type LogLevel = typeof ORCHESTRATOR_CONFIG.defaults.logLevel;
export type WorkflowState = keyof typeof ORCHESTRATOR_CONFIG.states.workflow;
export type StepState = keyof typeof ORCHESTRATOR_CONFIG.states.step;
export type Priority = keyof typeof ORCHESTRATOR_CONFIG.states.priority;