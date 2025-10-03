/**
 * Server Logger for Orchestrator HTTP Server
 *
 * Provides structured logging with proper levels, correlation ID support, and colorized terminal output.
 * Extends the base Logger class to add server-specific logging functionality with context-aware formatting.
 *
 * @example
 * ```typescript
 * const logger = new ServerLogger(config);
 * const correlationId = logger.generateCorrelationId();
 * logger.workflowStarted('wf_123', 'debug-issue', 'Fix login bug');
 * logger.taskCreated('task_456', 'issue-detective', 'wf_123');
 * ```
 */

import { Logger, LogEntry } from './monitoring/logger.js';
import { OrchestrationConfig } from './types.js';

/** Supported log levels in order of severity */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Context prefixes for different types of operations */
export type LogContext = 'SERVER' | 'WORKFLOW' | 'TASK' | 'AGENT' | 'HOOK→API' | 'API→CC' | 'API→HOOK' | 'RECOVERY';

/**
 * Extended metadata for server-specific logging
 * Includes HTTP request details, correlation tracking, and workflow context
 */
interface ServerLogMetadata extends Partial<LogEntry> {
  /** Unique identifier for request tracing across components */
  correlationId?: string;
  /** Workflow identifier for grouping related operations */
  workflowId?: string;
  /** Task identifier for tracking individual agent executions */
  taskId?: string;
  /** Name of the agent being executed */
  agentName?: string;
  /** Operation duration in milliseconds */
  duration?: number;
  /** HTTP method for request logging */
  httpMethod?: string;
  /** HTTP path for request logging */
  httpPath?: string;
  /** HTTP status code for response logging */
  httpStatus?: number;
  /** Source of the request (hook, claude, or internal) */
  source?: 'hook' | 'claude' | 'internal';
}

/**
 * Enhanced logger for the orchestrator HTTP server with context-aware formatting
 *
 * Features:
 * - Colorized terminal output with configurable levels
 * - Correlation ID tracking for request tracing
 * - Context-based message formatting
 * - Hook interaction tracing
 * - Workflow and task lifecycle logging
 */
export class ServerLogger {
  /** Base logger instance for file logging */
  private baseLogger: Logger;

  /** Configuration object for log levels and settings */
  private config: OrchestrationConfig;

  /** Map to associate correlation IDs with workflow IDs */
  private correlationMap: Map<string, string> = new Map();

  /** Whether to use ANSI colors in output (disabled if NO_COLOR env var is set) */
  private useColors: boolean;

  /** Whether to enable detailed hook interaction tracing */
  private traceHooks: boolean;

  /**
   * Creates a new ServerLogger instance
   *
   * @param config - Orchestration configuration containing log level and other settings
   */
  constructor(config: OrchestrationConfig) {
    this.config = config;
    this.baseLogger = new Logger(config);
    // Respect NO_COLOR environment variable for CI/CD environments
    this.useColors = process.env.NO_COLOR !== 'true';
    // Enable detailed hook tracing only when explicitly requested
    this.traceHooks = process.env.TRACE_HOOKS === 'true';
  }

  /**
   * Initialize the underlying logger
   */
  async initialize(): Promise<void> {
    await this.baseLogger.initialize();
  }

  /**
   * Generate a unique correlation ID for request tracking
   *
   * Used to trace a single operation across multiple components and log entries.
   * Format: req_<timestamp>_<random>
   *
   * @returns A unique correlation identifier
   */
  generateCorrelationId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Associate a workflow ID with a correlation ID for cross-reference tracking
   *
   * This allows linking HTTP requests to specific workflow executions.
   *
   * @param correlationId - The correlation ID from the initial request
   * @param workflowId - The workflow ID generated for this execution
   */
  associateWorkflow(correlationId: string, workflowId: string): void {
    this.correlationMap.set(correlationId, workflowId);
  }

  /**
   * Log a message with context prefix for better tracing and organization
   *
   * This is the core logging method that handles:
   * - Log level filtering based on configuration
   * - Context-aware message formatting
   * - Hook tracing control
   * - Colorized terminal output
   * - File logging through parent Logger
   *
   * @param level - Log severity level
   * @param context - Operational context for message categorization
   * @param message - The main log message
   * @param metadata - Additional structured data for the log entry
   */
  logWithContext(
    level: LogLevel,
    context: LogContext,
    message: string,
    metadata?: ServerLogMetadata
  ): void {
    // Filter debug logs unless explicitly enabled
    if (level === 'debug' && this.config.logLevel !== 'debug') {
      return;
    }

    // Control hook tracing verbosity to avoid log spam
    if ((context === 'HOOK→API' || context === 'API→HOOK') && !this.traceHooks && level === 'debug') {
      return;
    }

    // Format message with context, colors, and metadata
    const formattedMessage = this.formatContextMessage(level, context, message, metadata);

    // Output to appropriate console method based on log level
    switch (level) {
      case 'error':
        console.error(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'debug':
        if (this.config.logLevel === 'debug') {
          console.log(formattedMessage);
        }
        break;
      default:
        console.log(formattedMessage);
    }

    // Also persist to log files through base Logger using public methods
    // Use context as component for file logs to avoid duplication
    const logEntry: Partial<LogEntry> = {
      component: context.toLowerCase().replace('→', '-to-'),
      ...metadata
    };

    switch (level) {
      case 'debug':
        this.baseLogger.debug(message, logEntry);
        break;
      case 'info':
        this.baseLogger.info(message, logEntry);
        break;
      case 'warn':
        this.baseLogger.warn(message, logEntry);
        break;
      case 'error':
        this.baseLogger.error(message, undefined, logEntry);
        break;
    }
  }

  /**
   * Format log message with context, colors, and metadata for terminal display
   *
   * Creates a structured log line with:
   * - Timestamp
   * - Colored log level
   * - Colored context prefix
   * - Correlation/workflow/task identifiers
   * - Main message
   * - Duration and HTTP status if applicable
   *
   * @param level - Log severity level for color selection
   * @param context - Operational context for prefix color
   * @param message - Main log message
   * @param metadata - Additional data to display
   * @returns Formatted log string ready for terminal output
   */
  private formatContextMessage(
    level: LogLevel,
    context: LogContext,
    message: string,
    metadata?: ServerLogMetadata
  ): string {
    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5);

    let formatted = '';

    // Timestamp in dim color
    formatted += this.colorize(`[${timestamp}]`, 'dim');
    formatted += ' ';

    // Log level with severity-based color
    formatted += this.colorizeLevel(levelStr, level);
    formatted += ' ';

    // Context with operation-type-based color
    formatted += this.colorizeContext(`[${context}]`, context);
    formatted += ' ';

    // Add tracking identifiers if present
    if (metadata?.correlationId) {
      // Truncate correlation ID for readability while keeping uniqueness
      formatted += this.colorize(`[${metadata.correlationId.substring(0, 12)}]`, 'dim');
      formatted += ' ';
    }

    if (metadata?.workflowId) {
      // Extract meaningful part of workflow ID (after timestamp)
      const shortId = metadata.workflowId.split('_')[1]?.substring(0, 8) || metadata.workflowId.substring(0, 8);
      formatted += this.colorize(`[wf:${shortId}]`, 'cyan');
      formatted += ' ';
    }

    if (metadata?.taskId) {
      // Extract meaningful part of task ID (after timestamp)
      const shortId = metadata.taskId.split('_')[1]?.substring(0, 8) || metadata.taskId.substring(0, 8);
      formatted += this.colorize(`[task:${shortId}]`, 'magenta');
      formatted += ' ';
    }

    if (metadata?.agentName) {
      formatted += this.colorize(`[${metadata.agentName}]`, 'yellow');
      formatted += ' ';
    }

    // Main message content
    formatted += message;

    // Optional timing information
    if (metadata?.duration !== undefined) {
      formatted += this.colorize(` (${metadata.duration}ms)`, 'dim');
    }

    // Optional HTTP status with success/error color coding
    if (metadata?.httpStatus) {
      const statusColor = metadata.httpStatus < 400 ? 'green' : 'red';
      formatted += this.colorize(` [${metadata.httpStatus}]`, statusColor);
    }

    return formatted;
  }

  /**
   * Apply ANSI color codes to text for terminal output
   *
   * @param text - Text to colorize
   * @param color - Color name from predefined palette
   * @returns Colorized text with reset code appended
   */
  private colorize(text: string, color: string): string {
    if (!this.useColors) return text;

    /** ANSI color code mapping */
    const colors: Record<string, string> = {
      reset: '\x1b[0m',
      bright: '\x1b[1m',
      dim: '\x1b[2m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
      white: '\x1b[37m',
      gray: '\x1b[90m'
    };

    return `${colors[color] || ''}${text}${colors.reset}`;
  }

  /**
   * Apply color based on log severity level
   *
   * @param level - Log level text to colorize
   * @param logLevel - Severity level for color selection
   * @returns Colorized log level text
   */
  private colorizeLevel(level: string, logLevel: LogLevel): string {
    /** Color mapping for log levels based on severity */
    const levelColors: Record<LogLevel, string> = {
      debug: 'gray',    // Subdued for verbose output
      info: 'green',    // Positive/normal operations
      warn: 'yellow',   // Caution/attention needed
      error: 'red'      // Problems/failures
    };

    return this.colorize(level, levelColors[logLevel] || 'white');
  }

  /**
   * Apply color based on operational context
   *
   * @param context - Context text to colorize
   * @param contextType - Context type for color selection
   * @returns Colorized context text
   */
  private colorizeContext(context: string, contextType: LogContext): string {
    /** Color mapping for different operational contexts */
    const contextColors: Record<LogContext, string> = {
      'SERVER': 'blue',      // HTTP server operations
      'WORKFLOW': 'cyan',    // Workflow lifecycle events
      'TASK': 'magenta',     // Task management operations
      'AGENT': 'yellow',     // Agent execution events
      'HOOK→API': 'green',   // Hook-to-API communications
      'API→CC': 'blue',      // API-to-Claude-Code responses
      'API→HOOK': 'blue',    // API-to-Hook communications
      'RECOVERY': 'red'      // Error recovery operations
    };

    return this.colorize(context, contextColors[contextType] || 'white');
  }

  /**
   * Log an incoming HTTP request with correlation tracking
   *
   * @param method - HTTP method (GET, POST, etc.)
   * @param path - Request path
   * @param correlationId - Unique request identifier
   * @param source - Source of the request for context
   */
  logRequest(method: string, path: string, correlationId: string, source?: 'hook' | 'claude' | 'internal'): void {
    if (this.config.logLevel === 'debug') {
      // Use appropriate context based on request source
      const context: LogContext = source === 'hook' ? 'HOOK→API' : 'SERVER';
      this.logWithContext('debug', context, `${method} ${path}`, {
        correlationId,
        httpMethod: method,
        httpPath: path,
        source
      });
    }
  }

  /**
   * Log HTTP response with timing and status information
   *
   * @param method - HTTP method
   * @param path - Request path
   * @param status - HTTP status code
   * @param duration - Request processing time in milliseconds
   * @param correlationId - Request correlation identifier
   */
  logResponse(method: string, path: string, status: number, duration: number, correlationId: string): void {
    if (this.config.logLevel === 'debug') {
      this.logWithContext('debug', 'SERVER', `${method} ${path} completed`, {
        correlationId,
        httpMethod: method,
        httpPath: path,
        httpStatus: status,
        duration
      });
    }
  }

  // =============================================================================
  // Convenience Methods for Common Logging Patterns
  // =============================================================================

  /**
   * Log server startup completion
   *
   * @param port - Port number the server is listening on
   */
  serverStarted(port: number): void {
    this.logWithContext('info', 'SERVER', `Orchestrator server running on http://localhost:${port}`);
  }

  /**
   * Log server shutdown initiation
   */
  serverStopping(): void {
    this.logWithContext('info', 'SERVER', 'Shutting down orchestrator server...');
  }

  /**
   * Log workflow initialization
   *
   * @param workflowId - Unique workflow identifier
   * @param workflowType - Type of workflow being started
   * @param taskDescription - Description of the task to be executed
   */
  workflowStarted(workflowId: string, workflowType: string, taskDescription: string): void {
    this.logWithContext('info', 'WORKFLOW', `Starting workflow: ${workflowType}`, {
      workflowId,
      metadata: {
        workflowType,
        // Truncate long descriptions for readability
        taskDescription: taskDescription.substring(0, 100)
      }
    });
  }

  /**
   * Log workflow completion
   *
   * @param workflowId - Workflow identifier
   * @param duration - Total workflow execution time in milliseconds
   */
  workflowCompleted(workflowId: string, duration: number): void {
    this.logWithContext('info', 'WORKFLOW', `Completed: All agents finished`, {
      workflowId,
      duration
    });
  }

  /**
   * Log task creation for an agent
   *
   * @param taskId - Unique task identifier
   * @param agentName - Name of the agent assigned to this task
   * @param workflowId - Parent workflow identifier
   */
  taskCreated(taskId: string, agentName: string, workflowId: string): void {
    this.logWithContext('info', 'TASK', `Created for agent: ${agentName}`, {
      taskId,
      agentName,
      workflowId
    });
  }

  /**
   * Log task discovery by Claude Code
   *
   * @param taskId - Task identifier that was discovered
   * @param agentName - Agent name for this task
   * @param workflowId - Parent workflow identifier
   */
  taskDiscovered(taskId: string, agentName: string, workflowId: string): void {
    this.logWithContext('info', 'API→CC', `Task discovered by Claude for execution`, {
      taskId,
      agentName,
      workflowId
    });
  }

  /**
   * Log task completion or failure
   *
   * @param taskId - Task identifier
   * @param agentName - Agent that executed the task
   * @param success - Whether the task completed successfully
   * @param duration - Task execution time in milliseconds
   */
  taskCompleted(taskId: string, agentName: string, success: boolean, duration: number): void {
    const level: LogLevel = success ? 'info' : 'error';
    const message = success ? `Completed: ${agentName}` : `Failed: ${agentName}`;
    this.logWithContext(level, 'AGENT', message, {
      taskId,
      agentName,
      duration
    });
  }

  /**
   * Log incoming hook request
   *
   * @param hookType - Type of hook (UserPromptSubmit, PostToolUse, etc.)
   * @param details - Additional details about the hook request
   */
  hookRequestReceived(hookType: string, details: string): void {
    this.logWithContext('info', 'HOOK→API', `${hookType}: ${details}`);
  }

  /**
   * Log task result submission from hook
   *
   * @param taskId - Task identifier
   * @param agentName - Agent that completed the task
   * @param success - Whether the task was successful
   */
  taskResultReceived(taskId: string, agentName: string, success: boolean): void {
    this.logWithContext('info', 'HOOK→API', `Task result received for ${agentName}`, {
      taskId,
      agentName,
      metadata: { success }
    });
  }

  /**
   * Log creation of next task in workflow sequence
   *
   * @param workflowId - Parent workflow identifier
   * @param nextAgent - Agent name for the next task
   */
  nextTaskCreated(workflowId: string, nextAgent: string): void {
    this.logWithContext('info', 'WORKFLOW', `Next task queued: ${nextAgent}`, {
      workflowId,
      agentName: nextAgent
    });
  }

  /**
   * Log recovery or fallback operations
   *
   * @param action - Type of recovery action being taken
   * @param details - Details about the recovery attempt
   */
  recoveryAttempt(action: string, details: string): void {
    this.logWithContext('warn', 'RECOVERY', `${action}: ${details}`);
  }
}