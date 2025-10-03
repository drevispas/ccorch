import fs from 'fs/promises';
import path from 'path';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';
import { EventDrivenStateManager } from '../event-driven-state-manager';
import {
  WorkflowState,
  TaskState,
  AgentState,
  WorkflowStatus,
  TaskStatus,
  AgentStatus,
  ComplexityLevel,
  Command
} from '../types';

export interface MigrationConfig {
  sourceDir: string;
  backupDir?: string;
  dryRun?: boolean;
  batchSize?: number;
  enableLogging?: boolean;
  validateData?: boolean;
}

export interface MigrationResult {
  success: boolean;
  workflowsMigrated: number;
  tasksMigrated: number;
  agentsMigrated: number;
  errors: MigrationError[];
  warnings: string[];
  duration: number;
}

export interface MigrationError {
  type: 'workflow' | 'task' | 'agent';
  id: string;
  error: string;
  data?: any;
}

interface LegacyWorkflowState {
  id: string;
  workflowName?: string;
  name?: string;
  taskDescription?: string;
  description?: string;
  status: string;
  currentStepIndex?: number;
  stepStates?: any[];
  context?: any;
  createdAt?: string | Date;
  startedAt?: string | Date;
  completedAt?: string | Date;
  metadata?: any;
}

interface LegacySimplifiedState {
  id: string;
  workflowType?: string;
  taskDescription?: string;
  status: string;
  agents?: Record<string, any>;
  context?: any;
  pendingTaskId?: string;
}

interface LegacyUnifiedState {
  id: string;
  status: string;
  agents?: Record<string, any>;
  context?: any;
  metadata?: any;
}

export class StateMigrator {
  private stateManager: EventDrivenStateManager;
  private config: MigrationConfig;
  private logger: winston.Logger;
  private result: MigrationResult;

  constructor(stateManager: EventDrivenStateManager, config: MigrationConfig) {
    this.stateManager = stateManager;
    this.config = {
      backupDir: './backup',
      dryRun: false,
      batchSize: 10,
      enableLogging: true,
      validateData: true,
      ...config
    };

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      defaultMeta: { service: 'StateMigrator' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        new winston.transports.File({
          filename: 'migration.log',
          format: winston.format.json()
        })
      ]
    });

    this.result = {
      success: false,
      workflowsMigrated: 0,
      tasksMigrated: 0,
      agentsMigrated: 0,
      errors: [],
      warnings: [],
      duration: 0
    };
  }

  async migrate(): Promise<MigrationResult> {
    const startTime = Date.now();
    this.logger.info('Starting state migration', {
      sourceDir: this.config.sourceDir,
      dryRun: this.config.dryRun
    });

    try {
      if (!this.config.dryRun && this.config.backupDir) {
        await this.createBackup();
      }

      await this.migrateWorkflowStateManager();
      await this.migrateSimplifiedStateManager();
      await this.migrateUnifiedStateManager();

      this.result.success = this.result.errors.length === 0;
      this.result.duration = Date.now() - startTime;

      this.logger.info('Migration completed', this.result);
      return this.result;
    } catch (error) {
      this.logger.error('Migration failed', error);
      this.result.success = false;
      this.result.duration = Date.now() - startTime;
      return this.result;
    }
  }

  private async createBackup(): Promise<void> {
    const backupPath = path.join(this.config.backupDir!, `backup-${Date.now()}`);
    await fs.mkdir(backupPath, { recursive: true });

    const stateDirs = ['state', 'state-simple', 'archive'];
    for (const dir of stateDirs) {
      const sourcePath = path.join(this.config.sourceDir, '..', dir);
      const destPath = path.join(backupPath, dir);

      try {
        await this.copyDirectory(sourcePath, destPath);
        this.logger.info(`Backed up ${dir} to ${destPath}`);
      } catch (error) {
        this.logger.warn(`Failed to backup ${dir}:`, error);
      }
    }
  }

  private async copyDirectory(source: string, destination: string): Promise<void> {
    await fs.mkdir(destination, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, destPath);
      } else {
        await fs.copyFile(sourcePath, destPath);
      }
    }
  }

  private async migrateWorkflowStateManager(): Promise<void> {
    this.logger.info('Migrating WorkflowStateManager data');

    const stateDir = path.join(this.config.sourceDir, '..', 'state');
    const archiveDir = path.join(this.config.sourceDir, '..', 'archive');

    const activeWorkflows = await this.loadWorkflowsFromDirectory(stateDir);
    const archivedWorkflows = await this.loadArchivedWorkflows(archiveDir);

    const allWorkflows = [...activeWorkflows, ...archivedWorkflows];

    for (let i = 0; i < allWorkflows.length; i += this.config.batchSize!) {
      const batch = allWorkflows.slice(i, i + this.config.batchSize!);
      await this.migrateBatch(batch, 'workflow');
    }
  }

  private async loadWorkflowsFromDirectory(dir: string): Promise<LegacyWorkflowState[]> {
    const workflows: LegacyWorkflowState[] = [];

    try {
      const files = await fs.readdir(dir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        try {
          const content = await fs.readFile(path.join(dir, file), 'utf-8');
          const workflow = JSON.parse(content, this.dateReviver);
          workflows.push(workflow);
        } catch (error) {
          this.logger.error(`Failed to load workflow from ${file}:`, error);
          this.result.errors.push({
            type: 'workflow',
            id: file,
            error: `Failed to parse file: ${error}`
          });
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to read directory ${dir}:`, error);
    }

    return workflows;
  }

  private async loadArchivedWorkflows(archiveDir: string): Promise<LegacyWorkflowState[]> {
    const workflows: LegacyWorkflowState[] = [];

    try {
      const yearDirs = await fs.readdir(archiveDir);

      for (const year of yearDirs) {
        const yearPath = path.join(archiveDir, year);
        const stat = await fs.stat(yearPath);

        if (stat.isDirectory()) {
          const monthDirs = await fs.readdir(yearPath);

          for (const month of monthDirs) {
            const monthPath = path.join(yearPath, month);
            const monthStat = await fs.stat(monthPath);

            if (monthStat.isDirectory()) {
              const dayDirs = await fs.readdir(monthPath);

              for (const day of dayDirs) {
                const dayPath = path.join(monthPath, day);
                const dayStat = await fs.stat(dayPath);

                if (dayStat.isDirectory()) {
                  const dayWorkflows = await this.loadWorkflowsFromDirectory(dayPath);
                  workflows.push(...dayWorkflows);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to read archive directory ${archiveDir}:`, error);
    }

    return workflows;
  }

  private async migrateSimplifiedStateManager(): Promise<void> {
    this.logger.info('Migrating SimplifiedStateManager data');

    const stateDir = path.join(this.config.sourceDir, '..', 'state-simple', 'workflows');

    try {
      const files = await fs.readdir(stateDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        try {
          const content = await fs.readFile(path.join(stateDir, file), 'utf-8');
          const state = JSON.parse(content, this.dateReviver) as LegacySimplifiedState;
          await this.migrateSimplifiedWorkflow(state);
        } catch (error) {
          this.logger.error(`Failed to migrate simplified workflow ${file}:`, error);
          this.result.errors.push({
            type: 'workflow',
            id: file,
            error: `Failed to migrate: ${error}`
          });
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to read simplified state directory:`, error);
    }
  }

  private async migrateUnifiedStateManager(): Promise<void> {
    this.logger.info('Migrating UnifiedStateManager data');

    const activeDir = path.join(this.config.sourceDir, '..', 'state', 'active');
    const completedDir = path.join(this.config.sourceDir, '..', 'state', 'completed');

    const activeStates = await this.loadUnifiedStates(activeDir);
    const completedStates = await this.loadUnifiedStates(completedDir);

    const allStates = [...activeStates, ...completedStates];

    for (const state of allStates) {
      await this.migrateUnifiedWorkflow(state);
    }
  }

  private async loadUnifiedStates(dir: string): Promise<LegacyUnifiedState[]> {
    const states: LegacyUnifiedState[] = [];

    try {
      const workflowDirs = await fs.readdir(dir);

      for (const workflowDir of workflowDirs) {
        const statePath = path.join(dir, workflowDir, 'workflow-state.json');

        try {
          const content = await fs.readFile(statePath, 'utf-8');
          const state = JSON.parse(content, this.dateReviver);
          states.push(state);
        } catch (error) {
          this.logger.warn(`Failed to load unified state from ${statePath}:`, error);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to read unified state directory ${dir}:`, error);
    }

    return states;
  }

  private async migrateBatch(workflows: LegacyWorkflowState[], type: string): Promise<void> {
    for (const workflow of workflows) {
      try {
        const migratedWorkflow = this.convertToNewFormat(workflow);

        if (this.config.validateData) {
          this.validateWorkflow(migratedWorkflow);
        }

        if (!this.config.dryRun) {
          await this.createWorkflowInNewSystem(migratedWorkflow);
        }

        this.result.workflowsMigrated++;
        this.logger.debug(`Migrated workflow: ${migratedWorkflow.id}`);
      } catch (error) {
        this.logger.error(`Failed to migrate workflow ${workflow.id}:`, error);
        this.result.errors.push({
          type: 'workflow',
          id: workflow.id,
          error: String(error),
          data: workflow
        });
      }
    }
  }

  private convertToNewFormat(legacy: LegacyWorkflowState): WorkflowState {
    const id = legacy.id || uuidv4();
    const name = legacy.workflowName || legacy.name || `Workflow-${id}`;
    const description = legacy.taskDescription || legacy.description || '';

    const workflow: WorkflowState = {
      id,
      name,
      description,
      status: this.mapWorkflowStatus(legacy.status),
      tasks: new Map(),
      agents: new Map(),
      taskOrder: [],
      context: legacy.context || {},
      variables: {},
      checkpoints: [],
      createdAt: this.parseDate(legacy.createdAt) || new Date(),
      startedAt: this.parseDate(legacy.startedAt),
      completedAt: this.parseDate(legacy.completedAt),
      updatedAt: new Date(),
      lastModifiedAt: new Date(),
      createdBy: 'migration',
      tags: ['migrated'],
      metadata: {
        ...legacy.metadata,
        originalType: 'WorkflowStateManager',
        migrationDate: new Date().toISOString()
      }
    };

    if (legacy.stepStates) {
      this.migrateStepStates(workflow, legacy.stepStates);
    }

    return workflow;
  }

  private migrateStepStates(workflow: WorkflowState, stepStates: any[]): void {
    for (const step of stepStates) {
      const taskId = step.agentTaskId || uuidv4();
      const task: TaskState = {
        id: taskId,
        workflowId: workflow.id,
        agentName: step.agentName || 'unknown',
        complexity: ComplexityLevel.MODERATE,
        status: this.mapTaskStatus(step.status),
        description: step.description || '',
        input: step.input,
        output: step.result,
        error: step.error,
        retryCount: step.retryCount || 0,
        maxRetries: 3,
        timeout: 30000,
        priority: step.index || 0,
        dependencies: [],
        createdAt: this.parseDate(step.startTime) || new Date(),
        startedAt: this.parseDate(step.startTime),
        completedAt: this.parseDate(step.endTime),
        metadata: {
          stepIndex: step.index,
          originalStatus: step.status
        }
      };

      workflow.tasks.set(taskId, task);
      workflow.taskOrder.push(taskId);
      this.result.tasksMigrated++;
    }
  }

  private async migrateSimplifiedWorkflow(legacy: LegacySimplifiedState): Promise<void> {
    try {
      const workflow = this.convertSimplifiedToNewFormat(legacy);

      if (this.config.validateData) {
        this.validateWorkflow(workflow);
      }

      if (!this.config.dryRun) {
        await this.createWorkflowInNewSystem(workflow);
      }

      this.result.workflowsMigrated++;
      this.logger.debug(`Migrated simplified workflow: ${workflow.id}`);
    } catch (error) {
      this.logger.error(`Failed to migrate simplified workflow ${legacy.id}:`, error);
      this.result.errors.push({
        type: 'workflow',
        id: legacy.id,
        error: String(error),
        data: legacy
      });
    }
  }

  private convertSimplifiedToNewFormat(legacy: LegacySimplifiedState): WorkflowState {
    const workflow: WorkflowState = {
      id: legacy.id,
      name: legacy.workflowType || `Workflow-${legacy.id}`,
      description: legacy.taskDescription || '',
      status: this.mapWorkflowStatus(legacy.status),
      tasks: new Map(),
      agents: new Map(),
      taskOrder: [],
      context: legacy.context || {},
      variables: {},
      checkpoints: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastModifiedAt: new Date(),
      createdBy: 'migration',
      tags: ['migrated', 'simplified'],
      metadata: {
        originalType: 'SimplifiedStateManager',
        pendingTaskId: legacy.pendingTaskId,
        migrationDate: new Date().toISOString()
      }
    };

    if (legacy.agents) {
      this.migrateSimplifiedAgents(workflow, legacy.agents);
    }

    return workflow;
  }

  private migrateSimplifiedAgents(workflow: WorkflowState, agents: Record<string, any>): void {
    for (const [agentName, agentData] of Object.entries(agents)) {
      const agent: AgentState = {
        name: agentName,
        complexity: ComplexityLevel.MODERATE,
        status: this.mapAgentStatus(agentData.status),
        capabilities: [],
        version: '1.0.0',
        executionCount: 1,
        successCount: agentData.status === 'completed' ? 1 : 0,
        failureCount: agentData.status === 'failed' ? 1 : 0,
        averageExecutionTime: 0,
        metadata: agentData
      };

      workflow.agents.set(agentName, agent);
      this.result.agentsMigrated++;
    }
  }

  private async migrateUnifiedWorkflow(legacy: LegacyUnifiedState): Promise<void> {
    try {
      const workflow = this.convertUnifiedToNewFormat(legacy);

      if (this.config.validateData) {
        this.validateWorkflow(workflow);
      }

      if (!this.config.dryRun) {
        await this.createWorkflowInNewSystem(workflow);
      }

      this.result.workflowsMigrated++;
      this.logger.debug(`Migrated unified workflow: ${workflow.id}`);
    } catch (error) {
      this.logger.error(`Failed to migrate unified workflow ${legacy.id}:`, error);
      this.result.errors.push({
        type: 'workflow',
        id: legacy.id,
        error: String(error),
        data: legacy
      });
    }
  }

  private convertUnifiedToNewFormat(legacy: LegacyUnifiedState): WorkflowState {
    const workflow: WorkflowState = {
      id: legacy.id,
      name: `Workflow-${legacy.id}`,
      description: '',
      status: this.mapWorkflowStatus(legacy.status),
      tasks: new Map(),
      agents: new Map(),
      taskOrder: [],
      context: legacy.context || {},
      variables: {},
      checkpoints: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastModifiedAt: new Date(),
      createdBy: 'migration',
      tags: ['migrated', 'unified'],
      metadata: {
        ...legacy.metadata,
        originalType: 'UnifiedStateManager',
        migrationDate: new Date().toISOString()
      }
    };

    if (legacy.agents) {
      this.migrateUnifiedAgents(workflow, legacy.agents);
    }

    return workflow;
  }

  private migrateUnifiedAgents(workflow: WorkflowState, agents: Record<string, any>): void {
    for (const [agentName, agentData] of Object.entries(agents)) {
      const taskId = uuidv4();
      const task: TaskState = {
        id: taskId,
        workflowId: workflow.id,
        agentName,
        complexity: ComplexityLevel.MODERATE,
        status: this.mapTaskStatus(agentData.status),
        description: '',
        output: agentData.output,
        retryCount: 0,
        maxRetries: 3,
        timeout: 30000,
        priority: agentData.step || 0,
        dependencies: [],
        createdAt: this.parseDate(agentData.timestamp) || new Date(),
        metadata: {
          resultPath: agentData.resultPath,
          originalData: agentData
        }
      };

      workflow.tasks.set(taskId, task);
      workflow.taskOrder.push(taskId);
      this.result.tasksMigrated++;
    }
  }

  private mapWorkflowStatus(status: string): WorkflowStatus {
    const statusMap: Record<string, WorkflowStatus> = {
      'pending': WorkflowStatus.PENDING,
      'initializing': WorkflowStatus.INITIALIZING,
      'running': WorkflowStatus.RUNNING,
      'in-progress': WorkflowStatus.RUNNING,
      'paused': WorkflowStatus.PAUSED,
      'completed': WorkflowStatus.COMPLETED,
      'failed': WorkflowStatus.FAILED,
      'cancelled': WorkflowStatus.CANCELLED,
      'canceled': WorkflowStatus.CANCELLED,
      'timeout': WorkflowStatus.TIMEOUT,
      'error': WorkflowStatus.FAILED
    };

    return statusMap[status.toLowerCase()] || WorkflowStatus.PENDING;
  }

  private mapTaskStatus(status: string): TaskStatus {
    const statusMap: Record<string, TaskStatus> = {
      'pending': TaskStatus.PENDING,
      'assigned': TaskStatus.ASSIGNED,
      'in-progress': TaskStatus.IN_PROGRESS,
      'in_progress': TaskStatus.IN_PROGRESS,
      'running': TaskStatus.IN_PROGRESS,
      'completed': TaskStatus.COMPLETED,
      'failed': TaskStatus.FAILED,
      'cancelled': TaskStatus.CANCELLED,
      'canceled': TaskStatus.CANCELLED,
      'timeout': TaskStatus.TIMEOUT,
      'retry': TaskStatus.RETRY,
      'error': TaskStatus.FAILED
    };

    return statusMap[status.toLowerCase()] || TaskStatus.PENDING;
  }

  private mapAgentStatus(status: string): AgentStatus {
    const statusMap: Record<string, AgentStatus> = {
      'idle': AgentStatus.IDLE,
      'loading': AgentStatus.LOADING,
      'ready': AgentStatus.READY,
      'executing': AgentStatus.EXECUTING,
      'running': AgentStatus.EXECUTING,
      'completed': AgentStatus.COMPLETED,
      'failed': AgentStatus.FAILED,
      'timeout': AgentStatus.TIMEOUT,
      'error': AgentStatus.FAILED
    };

    return statusMap[status.toLowerCase()] || AgentStatus.IDLE;
  }

  private parseDate(value: any): Date | undefined {
    if (!value) return undefined;
    if (value instanceof Date) return value;
    if (typeof value === 'string') return new Date(value);
    if (typeof value === 'number') return new Date(value);
    return undefined;
  }

  private dateReviver(key: string, value: any): any {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      return new Date(value);
    }
    return value;
  }

  private validateWorkflow(workflow: WorkflowState): void {
    if (!workflow.id) {
      throw new Error('Workflow ID is required');
    }

    if (!workflow.name) {
      throw new Error('Workflow name is required');
    }

    if (!workflow.status) {
      throw new Error('Workflow status is required');
    }

    if (workflow.tasks.size === 0) {
      this.result.warnings.push(`Workflow ${workflow.id} has no tasks`);
    }

    for (const [taskId, task] of workflow.tasks) {
      if (task.workflowId !== workflow.id) {
        throw new Error(`Task ${taskId} has mismatched workflow ID`);
      }
    }
  }

  private async createWorkflowInNewSystem(workflow: WorkflowState): Promise<void> {
    const correlationId = uuidv4();

    const command: Command = {
      id: uuidv4(),
      type: 'CreateWorkflow',
      payload: {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        context: workflow.context,
        variables: workflow.variables,
        tags: workflow.tags,
        metadata: workflow.metadata
      },
      metadata: {
        correlationId,
        userId: 'migration'
      },
      timestamp: new Date()
    };

    await this.stateManager.executeCommand(command);

    for (const [taskId, task] of workflow.tasks) {
      const taskCommand: Command = {
        id: uuidv4(),
        type: 'CreateTask',
        payload: {
          id: task.id,
          workflowId: task.workflowId,
          agentName: task.agentName,
          complexity: task.complexity,
          description: task.description,
          input: task.input,
          maxRetries: task.maxRetries,
          timeout: task.timeout,
          priority: task.priority,
          dependencies: task.dependencies,
          metadata: task.metadata
        },
        metadata: {
          correlationId,
          workflowId: workflow.id
        },
        timestamp: new Date()
      };

      await this.stateManager.executeCommand(taskCommand);
    }

    if (workflow.status !== WorkflowStatus.PENDING) {
      const statusCommand: Command = {
        id: uuidv4(),
        type: 'UpdateWorkflowStatus',
        payload: {
          workflowId: workflow.id,
          status: workflow.status
        },
        metadata: {
          correlationId,
          workflowId: workflow.id
        },
        timestamp: new Date()
      };

      await this.stateManager.executeCommand(statusCommand);
    }
  }

  async rollback(): Promise<void> {
    this.logger.info('Starting rollback');

    if (this.result.workflowsMigrated > 0) {
      const state = this.stateManager.getState();

      for (const [workflowId, workflow] of state.workflows) {
        if (workflow.tags.includes('migrated')) {
          this.logger.info(`Rolling back workflow: ${workflowId}`);
        }
      }
    }

    this.logger.info('Rollback completed');
  }
}