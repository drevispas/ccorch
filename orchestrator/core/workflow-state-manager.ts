import { WorkflowState, StepState, WorkflowMetrics } from './types.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ORCHESTRATOR_CONFIG } from './config/constants.js';
import { ArchiveManager } from './archive-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class WorkflowStateManager {
  private readonly stateDir: string;
  private readonly archiveDir: string;
  private readonly archiveManager: ArchiveManager;

  constructor() {
    this.stateDir = join(__dirname, '../state');
    this.archiveDir = join(__dirname, '../archive');
    this.archiveManager = new ArchiveManager();
  }

  async initialize(): Promise<void> {
    await this.ensureDirectoryExists(this.stateDir);
    await this.ensureDirectoryExists(this.archiveDir);
    await this.archiveManager.initialize();
  }

  async createWorkflow(
    workflowName: string,
    taskDescription: string,
    totalSteps: number,
    workflowId?: string
  ): Promise<WorkflowState> {
    const id = workflowId || this.generateWorkflowId();
    const state: WorkflowState = {
      id,
      workflowName,
      taskDescription,
      status: 'pending',
      startTime: new Date(),
      currentStepIndex: 0,
      stepStates: Array.from({ length: totalSteps }, (_, index) => ({
        index,
        agentName: '',
        status: 'pending'
      })),
      context: {}
    };

    await this.saveState(state);
    return state;
  }

  async updateWorkflowStatus(
    workflowId: string,
    status: WorkflowState['status']
  ): Promise<void> {
    const state = await this.getState(workflowId);
    state.status = status;

    if (status === 'completed' || status === 'failed') {
      state.endTime = new Date();
    }

    await this.saveState(state);
  }

  async updateStepState(
    workflowId: string,
    stepIndex: number,
    stepState: Partial<StepState>
  ): Promise<void> {
    const state = await this.getState(workflowId);

    if (stepIndex >= 0 && stepIndex < state.stepStates.length) {
      state.stepStates[stepIndex] = { ...state.stepStates[stepIndex], ...stepState };

      if (stepState.status === 'running') {
        state.currentStepIndex = stepIndex;
        state.stepStates[stepIndex].startTime = new Date();
      } else if (stepState.status === 'completed' || stepState.status === 'failed') {
        state.stepStates[stepIndex].endTime = new Date();
      }
    }

    await this.saveState(state);
  }

  async getState(workflowId: string): Promise<WorkflowState> {
    try {
      const filePath = join(this.stateDir, `${workflowId}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      const state = JSON.parse(data);

      // Convert date strings back to Date objects
      state.startTime = new Date(state.startTime);
      if (state.endTime) {
        state.endTime = new Date(state.endTime);
      }

      state.stepStates.forEach((step: any) => {
        if (step.startTime) step.startTime = new Date(step.startTime);
        if (step.endTime) step.endTime = new Date(step.endTime);
      });

      return state;
    } catch (error) {
      throw new Error(`Failed to load workflow state: ${workflowId}`);
    }
  }

  async saveState(state: WorkflowState): Promise<void> {
    const filePath = join(this.stateDir, `${state.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(state, null, 2));
  }

  async archiveWorkflow(workflowId: string): Promise<void> {
    const state = await this.getState(workflowId);
    const stateFilePath = join(this.stateDir, `${workflowId}.json`);

    // Use the new ArchiveManager for organized archiving
    await this.archiveManager.archiveWorkflow(state);

    // Remove the state file after successful archiving
    await fs.unlink(stateFilePath);
  }

  async listActiveWorkflows(): Promise<WorkflowState[]> {
    try {
      const files = await fs.readdir(this.stateDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      const workflows = await Promise.all(
        jsonFiles.map(async (file) => {
          const workflowId = file.replace('.json', '');
          return this.getState(workflowId);
        })
      );

      return workflows.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    } catch (error) {
      return [];
    }
  }

  async getWorkflowProgress(workflowId: string): Promise<{
    total: number;
    completed: number;
    failed: number;
    running: number;
    pending: number;
    percentage: number;
  }> {
    const state = await this.getState(workflowId);
    const completed = state.stepStates.filter(s => s.status === 'completed').length;
    const failed = state.stepStates.filter(s => s.status === 'failed').length;
    const running = state.stepStates.filter(s => s.status === 'running').length;
    const pending = state.stepStates.filter(s => s.status === 'pending').length;
    const total = state.stepStates.length;

    return {
      total,
      completed,
      failed,
      running,
      pending,
      percentage: total > 0 ? Math.round((completed / total) * ORCHESTRATOR_CONFIG.performance.percentageBase) : 0
    };
  }

  private generateWorkflowId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `wf_${timestamp}_${random}`;
  }

  private async ensureDirectoryExists(dir: string): Promise<void> {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  private generateMetrics(state: WorkflowState): WorkflowMetrics {
    const totalDuration = state.endTime
      ? state.endTime.getTime() - state.startTime.getTime()
      : Date.now() - state.startTime.getTime();

    const stepDurations: Record<string, number> = {};
    let errorCount = 0;

    state.stepStates.forEach(step => {
      if (step.startTime && step.endTime) {
        stepDurations[step.agentName] = step.endTime.getTime() - step.startTime.getTime();
      }
      if (step.status === 'failed') {
        errorCount++;
      }
    });

    const completedSteps = state.stepStates.filter(s => s.status === 'completed').length;
    const successRate = state.stepStates.length > 0
      ? (completedSteps / state.stepStates.length) * ORCHESTRATOR_CONFIG.performance.percentageBase
      : 0;

    return {
      workflowId: state.id,
      workflowName: state.workflowName,
      totalDuration,
      stepDurations,
      successRate,
      errorCount,
      retryCount: this.calculateRetryCount(state)
    };
  }

  /**
   * Calculate the total number of retries across all steps in the workflow
   */
  private calculateRetryCount(state: WorkflowState): number {
    return state.stepStates.reduce((total, step) => {
      // Count how many times each step was retried
      // Each failed step that was later completed counts as a retry
      const stepRetries = step.status === 'completed' && step.error ? 1 : 0;
      return total + stepRetries;
    }, 0);
  }
}