import winston from 'winston';
import { CorrelationId, WorkflowId, TaskId, AgentType } from '../schemas/common';
import { LogLevel, LogContext } from '../../core/enums';
import { IServerLogger } from '../../core/interfaces';
import { LogMetadata, LoggerConfig as BaseLoggerConfig } from '../../core/types/common.types';

// Re-export for backward compatibility
export { LogLevel, LogContext };

interface LoggerConfig extends BaseLoggerConfig {
  logLevel: LogLevel | string;
  enableMetrics: boolean;
  logDirectory?: string;
}

export class ServerLogger implements IServerLogger {
  private logger: winston.Logger;
  private config: LoggerConfig;
  private metrics: Map<string, number>;

  constructor(config: LoggerConfig) {
    this.config = config;
    this.metrics = new Map();

    // Create winston logger with custom formatting
    this.logger = winston.createLogger({
      level: config.logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'orchestrator-server' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });

    // Add file transport if log directory is provided
    if (config.logDirectory) {
      this.logger.add(new winston.transports.File({
        filename: `${config.logDirectory}/error.log`,
        level: 'error'
      }));

      this.logger.add(new winston.transports.File({
        filename: `${config.logDirectory}/combined.log`
      }));
    }
  }

  async initialize(): Promise<void> {
    this.logger.info('Server logger initialized', {
      config: this.config
    });
  }

  generateCorrelationId(): CorrelationId {
    return `req_${Date.now()}` as CorrelationId;
  }

  logRequest(method: string, path: string, correlationId?: string): void {
    this.logger.info('Request received', {
      method,
      path,
      correlationId,
      context: 'SERVER'
    });

    if (this.config.enableMetrics) {
      const key = `requests.${method}.${path}`;
      this.metrics.set(key, (this.metrics.get(key) || 0) + 1);
    }
  }

  logResponse(method: string, path: string, statusCode: number, duration: number, correlationId?: string): void {
    const level = statusCode >= 400 ? LogLevel.ERROR : LogLevel.INFO;
    this.logger.log(level, 'Response sent', {
      method,
      path,
      statusCode,
      duration,
      correlationId,
      context: 'SERVER'
    });

    if (this.config.enableMetrics) {
      const key = `responses.${statusCode}`;
      this.metrics.set(key, (this.metrics.get(key) || 0) + 1);
    }
  }

  logWithContext(level: string, context: string, message: string, metadata?: LogMetadata): void {
    this.logger.log(level, message, {
      context,
      ...metadata
    });
  }

  workflowStarted(workflowId: WorkflowId, workflowType: string, taskDescription: string): void {
    this.logger.info('Workflow started', {
      workflowId,
      workflowType,
      taskDescription,
      context: 'WORKFLOW'
    });

    if (this.config.enableMetrics) {
      const key = `workflows.started.${workflowType}`;
      this.metrics.set(key, (this.metrics.get(key) || 0) + 1);
    }
  }

  workflowCompleted(workflowId: WorkflowId, duration: number): void {
    this.logger.info('Workflow completed', {
      workflowId,
      duration,
      context: 'WORKFLOW'
    });

    if (this.config.enableMetrics) {
      const key = 'workflows.completed';
      this.metrics.set(key, (this.metrics.get(key) || 0) + 1);
    }
  }

  taskCreated(taskId: TaskId, agentType: AgentType, workflowId: WorkflowId): void {
    this.logger.info('Task created', {
      taskId,
      agentType,
      workflowId,
      context: 'TASK'
    });

    if (this.config.enableMetrics) {
      const key = `tasks.created.${agentType}`;
      this.metrics.set(key, (this.metrics.get(key) || 0) + 1);
    }
  }

  taskCompleted(taskId: TaskId, duration: number, success: boolean): void {
    const level = success ? LogLevel.INFO : LogLevel.WARN;
    this.logger.log(level, 'Task completed', {
      taskId,
      duration,
      success,
      context: 'TASK'
    });

    if (this.config.enableMetrics) {
      const key = success ? `tasks.completed.success` : `tasks.completed.failed`;
      this.metrics.set(key, (this.metrics.get(key) || 0) + 1);
    }
  }

  taskResultReceived(taskId: TaskId, agentType: AgentType, success: boolean): void {
    const level = success ? LogLevel.INFO : LogLevel.WARN;
    this.logger.log(level, 'Task result received', {
      taskId,
      agentType,
      success,
      context: 'TASK'
    });

    if (this.config.enableMetrics) {
      const key = success ? `tasks.success.${agentType}` : `tasks.failed.${agentType}`;
      this.metrics.set(key, (this.metrics.get(key) || 0) + 1);
    }
  }

  // ILogger base methods
  debug(message: string, meta?: LogMetadata): void {
    this.logger.debug(message, meta);
  }

  info(message: string, meta?: LogMetadata): void {
    this.logger.info(message, meta);
  }

  warn(message: string, meta?: LogMetadata): void {
    this.logger.warn(message, meta);
  }

  error(message: string, meta?: LogMetadata): void {
    this.logger.error(message, meta);
  }

  fatal(message: string, meta?: LogMetadata): void {
    this.logger.error(message, { ...meta, fatal: true });
  }

  getMetrics(): Map<string, number> {
    return new Map(this.metrics);
  }

  clearMetrics(): void {
    this.metrics.clear();
  }
}