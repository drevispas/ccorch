import { IOrchestratorService } from './interfaces';
import { CommandParser, ParsedCommand } from './command-parser';
import { ComplexityDetector, ComplexityAnalysis } from './complexity-detector';
import { WorkflowId } from '../server/schemas/common';
import { OrchestratorConfig, SystemState, WorkflowStateData } from './types/common.types';

export class Orchestrator implements IOrchestratorService {
  private initialized: boolean = false;
  private workflows: Map<WorkflowId, WorkflowStateData> = new Map();
  private config: OrchestratorConfig;
  private commandParser: CommandParser;
  private complexityDetector: ComplexityDetector;

  constructor(config?: OrchestratorConfig) {
    this.initialized = false;
    this.config = config || {};
    this.commandParser = new CommandParser();
    this.complexityDetector = new ComplexityDetector();
  }

  async initialize(config: OrchestratorConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  parseCommand(input: string): ParsedCommand | null {
    return this.commandParser.parseCommand(input);
  }

  analyzeComplexity(taskDescription: string): ComplexityAnalysis {
    return this.complexityDetector.analyzeComplexity(taskDescription);
  }

  async executeWorkflow(command: ParsedCommand): Promise<WorkflowId> {
    const workflowId = `workflow-${Date.now()}` as WorkflowId;
    const workflowData: WorkflowStateData = {
      id: workflowId,
      type: command.workflowType as any,
      status: 'running',
      tasks: [],
      metadata: {
        createdAt: new Date().toISOString(),
        complexity: command.complexity,
        description: command.taskDescription
      }
    };
    this.workflows.set(workflowId, workflowData);
    return workflowId;
  }

  getStatus(): SystemState {
    return {
      workflows: this.workflows,
      tasks: new Map(),
      agents: new Map(),
      metrics: {
        totalWorkflows: this.workflows.size,
        activeWorkflows: Array.from(this.workflows.values()).filter(w => w.status === 'running').length,
        completedWorkflows: Array.from(this.workflows.values()).filter(w => w.status === 'completed').length,
        failedWorkflows: Array.from(this.workflows.values()).filter(w => w.status === 'failed').length,
        totalTasks: 0,
        activeTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        averageWorkflowDuration: 0,
        averageTaskDuration: 0,
        systemUptime: process.uptime()
      }
    };
  }

  getAvailableWorkflows(): string[] {
    return ['bug-fix', 'feature-development', 'refactoring', 'testing'];
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
    this.workflows.clear();
  }
}