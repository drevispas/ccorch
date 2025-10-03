import { OrchestrationConfig } from '../types.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ORCHESTRATOR_CONFIG } from '../config/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  component: string;
  correlationId?: string;
  workflowId?: string;
  agentName?: string;
  stepIndex?: number;
  duration?: number;
  error?: any;
  metadata?: Record<string, any>;
}

export interface LogFilter {
  level?: LogEntry['level'];
  component?: string;
  workflowId?: string;
  agentName?: string;
  timeRange?: {
    start: Date;
    end: Date;
  };
  limit?: number;
}

export class Logger {
  private config: OrchestrationConfig;
  private logsDir: string;
  private logBuffer: LogEntry[] = [];
  private flushInterval?: NodeJS.Timeout;

  constructor(config: OrchestrationConfig) {
    this.config = config;
    this.logsDir = join(__dirname, '../../logs');
    this.startLogFlushing();
  }

  async initialize(): Promise<void> {
    await this.ensureDirectoryExists(this.logsDir);
  }

  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    await this.flushLogs();
  }

  debug(message: string, metadata?: Partial<LogEntry>): void {
    this.log('debug', message, metadata);
  }

  info(message: string, metadata?: Partial<LogEntry>): void {
    this.log('info', message, metadata);
  }

  warn(message: string, metadata?: Partial<LogEntry>): void {
    this.log('warn', message, metadata);
  }

  error(message: string, error?: any, metadata?: Partial<LogEntry>): void {
    this.log('error', message, { ...metadata, error });
  }

  logWorkflowStart(workflowId: string, workflowName: string, taskDescription: string): void {
    this.info('Workflow started', {
      workflowId,
      component: 'orchestrator',
      metadata: {
        workflowName,
        taskDescription,
        action: 'workflow_start'
      }
    });
  }

  logWorkflowComplete(workflowId: string, duration: number, status: 'completed' | 'failed'): void {
    this.info('Workflow completed', {
      workflowId,
      component: 'orchestrator',
      duration,
      metadata: {
        status,
        action: 'workflow_complete'
      }
    });
  }

  logAgentStart(workflowId: string, agentName: string, stepIndex: number): void {
    this.info('Agent execution started', {
      workflowId,
      agentName,
      stepIndex,
      component: 'orchestrator',
      metadata: {
        action: 'agent_start'
      }
    });
  }

  logAgentComplete(
    workflowId: string,
    agentName: string,
    stepIndex: number,
    duration: number,
    success: boolean,
    result?: string,
    error?: any
  ): void {
    const level = success ? 'info' : 'error';
    const message = success ? 'Agent execution completed' : 'Agent execution failed';

    this.log(level, message, {
      workflowId,
      agentName,
      stepIndex,
      duration,
      component: 'orchestrator',
      error,
      metadata: {
        success,
        result: result?.substring(0, ORCHESTRATOR_CONFIG.monitoring.maxResultLength), // Truncate long results
        action: 'agent_complete'
      }
    });
  }

  logCommandParsed(command: string, workflowType?: string, confidence?: number): void {
    this.debug('Command parsed', {
      component: 'command-parser',
      metadata: {
        command: command.substring(0, ORCHESTRATOR_CONFIG.monitoring.maxCommandLength), // Truncate long commands
        workflowType,
        confidence,
        action: 'command_parse'
      }
    });
  }

  logWorkflowSuggestion(command: string, suggestions: any[]): void {
    this.debug('Workflow suggestions generated', {
      component: 'command-parser',
      metadata: {
        command: command.substring(0, ORCHESTRATOR_CONFIG.monitoring.maxCommandLength),
        suggestionCount: suggestions.length,
        topSuggestion: suggestions[0]?.workflowType,
        action: 'workflow_suggest'
      }
    });
  }

  async getLogs(filter: LogFilter = {}): Promise<LogEntry[]> {
    const allLogs = await this.loadAllLogs();

    let filteredLogs = allLogs;

    // Apply filters
    if (filter.level) {
      const levelPriority = { debug: 0, info: 1, warn: 2, error: 3 };
      const minPriority = levelPriority[filter.level];
      filteredLogs = filteredLogs.filter(log => levelPriority[log.level] >= minPriority);
    }

    if (filter.component) {
      filteredLogs = filteredLogs.filter(log => log.component === filter.component);
    }

    if (filter.workflowId) {
      filteredLogs = filteredLogs.filter(log => log.workflowId === filter.workflowId);
    }

    if (filter.agentName) {
      filteredLogs = filteredLogs.filter(log => log.agentName === filter.agentName);
    }

    if (filter.timeRange) {
      filteredLogs = filteredLogs.filter(log => {
        const logTime = new Date(log.timestamp);
        return logTime >= filter.timeRange!.start && logTime <= filter.timeRange!.end;
      });
    }

    // Sort by timestamp (newest first)
    filteredLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit
    if (filter.limit) {
      filteredLogs = filteredLogs.slice(0, filter.limit);
    }

    return filteredLogs;
  }

  async getLogStats(timeRange?: { start: Date; end: Date }): Promise<{
    totalLogs: number;
    logsByLevel: Record<string, number>;
    logsByComponent: Record<string, number>;
    errorRate: number;
    topErrors: Array<{ message: string; count: number }>;
  }> {
    const logs = await this.getLogs({ timeRange });

    const logsByLevel = logs.reduce((acc, log) => {
      acc[log.level] = (acc[log.level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const logsByComponent = logs.reduce((acc, log) => {
      acc[log.component] = (acc[log.component] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const errorLogs = logs.filter(log => log.level === 'error');
    const errorRate = logs.length > 0 ? (errorLogs.length / logs.length) * 100 : 0;

    // Count error messages
    const errorCounts = errorLogs.reduce((acc, log) => {
      acc[log.message] = (acc[log.message] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topErrors = Object.entries(errorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([message, count]) => ({ message, count }));

    return {
      totalLogs: logs.length,
      logsByLevel,
      logsByComponent,
      errorRate: Math.round(errorRate * ORCHESTRATOR_CONFIG.performance.percentagePrecision) / ORCHESTRATOR_CONFIG.performance.percentagePrecision,
      topErrors
    };
  }

  createCorrelationId(): string {
    return `corr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  withCorrelationId(correlationId: string): Logger {
    const logger = new Logger(this.config);
    logger.logsDir = this.logsDir;
    logger.logBuffer = this.logBuffer;

    // Override log method to include correlation ID
    const originalLog = logger.log.bind(logger);
    logger.log = (level, message, metadata = {}) => {
      originalLog(level, message, { ...metadata, correlationId });
    };

    return logger;
  }

  private log(level: LogEntry['level'], message: string, metadata: Partial<LogEntry> = {}): void {
    // Check if this log level should be output
    const levelPriority = { debug: 0, info: 1, warn: 2, error: 3 };
    const configPriority = levelPriority[this.config.logLevel];
    const logPriority = levelPriority[level];

    if (logPriority < configPriority) {
      return;
    }

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      component: metadata.component || 'orchestrator',
      ...metadata
    };

    // Add to buffer for file logging
    this.logBuffer.push(logEntry);

    // Console output (simplified for readability)
    if (this.config.logLevel === 'debug' || level !== 'debug') {
      const consoleMessage = this.formatConsoleMessage(logEntry);

      switch (level) {
        case 'debug':
          console.debug(consoleMessage);
          break;
        case 'info':
          console.log(consoleMessage);
          break;
        case 'warn':
          console.warn(consoleMessage);
          break;
        case 'error':
          console.error(consoleMessage);
          break;
      }
    }
  }

  private formatConsoleMessage(logEntry: LogEntry): string {
    const { timestamp, level, component, message, workflowId, agentName, correlationId } = logEntry;

    let formatted = `[${timestamp}] ${level.toUpperCase().padEnd(5)} [${component}]`;

    if (correlationId) {
      formatted += ` [${correlationId}]`;
    }

    if (workflowId) {
      formatted += ` [wf:${workflowId.substring(0, 8)}]`;
    }

    if (agentName) {
      formatted += ` [${agentName}]`;
    }

    formatted += ` ${message}`;

    if (logEntry.error) {
      formatted += ` | Error: ${logEntry.error.message || logEntry.error}`;
    }

    if (logEntry.duration) {
      formatted += ` | Duration: ${logEntry.duration}ms`;
    }

    return formatted;
  }

  private startLogFlushing(): void {
    // Flush logs to file every 30 seconds
    this.flushInterval = setInterval(async () => {
      await this.flushLogs();
    }, ORCHESTRATOR_CONFIG.monitoring.logFlushInterval);
  }

  private async flushLogs(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      const logFile = join(this.logsDir, `orchestration-${today}.jsonl`);

      const logLines = this.logBuffer.map(log => JSON.stringify(log)).join('\n') + '\n';
      await fs.appendFile(logFile, logLines);

      this.logBuffer = [];
    } catch (error) {
      console.error('Failed to flush logs:', error);
    }
  }

  private async loadAllLogs(): Promise<LogEntry[]> {
    try {
      const files = await fs.readdir(this.logsDir);
      const logFiles = files.filter(f => f.endsWith('.jsonl'));

      const allLogs: LogEntry[] = [];

      for (const file of logFiles) {
        try {
          const content = await fs.readFile(join(this.logsDir, file), 'utf-8');
          const lines = content.trim().split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const logEntry = JSON.parse(line);
              allLogs.push(logEntry);
            } catch (parseError) {
              // Skip malformed log entries
            }
          }
        } catch (fileError) {
          // Skip files that can't be read
        }
      }

      return allLogs;
    } catch (error) {
      return [];
    }
  }

  private async ensureDirectoryExists(dir: string): Promise<void> {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }
}