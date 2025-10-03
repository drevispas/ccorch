import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  WorkflowState,
  StructuredAgentResult,
  StepState,
  AgentResult
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Simplified state file format - single JSON per workflow
 */
export interface SimplifiedWorkflowState {
  // Core workflow metadata
  id: string;
  workflowType: string;
  taskDescription: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  startTime: string;
  endTime?: string;

  // Agent execution tracking
  agents: {
    [agentName: string]: {
      stepIndex: number;
      status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
      startTime?: string;
      endTime?: string;
      result?: {
        success: boolean;
        output: string;
        artifacts?: Record<string, string>;
        metrics?: {
          duration: number;
          filesCreated: number;
        };
        handover?: {
          keyPoints: string[];
          instructions?: string;
        };
      };
      error?: string;
    };
  };

  // Additional metadata
  context: Record<string, any>;
  pendingTaskId?: string;
}

/**
 * Simplified result file format - one per agent per workflow
 */
export interface SimplifiedAgentResult {
  workflowId: string;
  agentName: string;
  stepIndex: number;
  status: 'completed' | 'failed' | 'partial';
  timestamp: string;
  output: string;
  success: boolean;
  artifacts?: Record<string, string>;
  handover?: {
    keyPoints: string[];
    instructions?: string;
  };
  metrics: {
    duration: number;
    filesCreated: number;
  };
}

/**
 * SimplifiedStateManager consolidates all state management into a clean, flat structure.
 *
 * New structure:
 * state/
 * ├── workflows/
 * │   └── {workflowId}.json     (single unified state file)
 * └── results/
 *     └── {workflowId}/
 *         ├── {agentName}.json  (agent results)
 */
export class SimplifiedStateManager {
  private readonly stateDir: string;
  private readonly workflowsDir: string;
  private readonly resultsDir: string;

  constructor() {
    this.stateDir = join(__dirname, '../state-simple');
    this.workflowsDir = join(this.stateDir, 'workflows');
    this.resultsDir = join(this.stateDir, 'results');
  }

  async initialize(): Promise<void> {
    await this.ensureDirectoryExists(this.stateDir);
    await this.ensureDirectoryExists(this.workflowsDir);
    await this.ensureDirectoryExists(this.resultsDir);
  }

  private async ensureDirectoryExists(path: string): Promise<void> {
    try {
      await fs.access(path);
    } catch {
      await fs.mkdir(path, { recursive: true });
    }
  }

  /**
   * Create a new workflow state file
   */
  async createWorkflow(
    workflowId: string,
    workflowType: string,
    taskDescription: string,
    agentNames: string[]
  ): Promise<void> {
    const agents: SimplifiedWorkflowState['agents'] = {};

    agentNames.forEach((name, index) => {
      agents[name] = {
        stepIndex: index + 1,
        status: 'pending'
      };
    });

    const workflowState: SimplifiedWorkflowState = {
      id: workflowId,
      workflowType,
      taskDescription,
      status: 'pending',
      startTime: new Date().toISOString(),
      agents,
      context: {}
    };

    const workflowFile = join(this.workflowsDir, `${workflowId}.json`);
    await fs.writeFile(workflowFile, JSON.stringify(workflowState, null, 2));

    // Create results directory for this workflow
    const workflowResultsDir = join(this.resultsDir, workflowId);
    await this.ensureDirectoryExists(workflowResultsDir);
  }

  /**
   * Update workflow status
   */
  async updateWorkflowStatus(
    workflowId: string,
    status: SimplifiedWorkflowState['status']
  ): Promise<void> {
    const workflowState = await this.getWorkflowState(workflowId);
    workflowState.status = status;

    if (status === 'completed' || status === 'failed') {
      workflowState.endTime = new Date().toISOString();
    }

    await this.saveWorkflowState(workflowId, workflowState);
  }

  /**
   * Update agent status within workflow
   */
  async updateAgentStatus(
    workflowId: string,
    agentName: string,
    status: SimplifiedWorkflowState['agents'][string]['status'],
    result?: AgentResult
  ): Promise<void> {
    const workflowState = await this.getWorkflowState(workflowId);

    if (!workflowState.agents[agentName]) {
      throw new Error(`Agent ${agentName} not found in workflow ${workflowId}`);
    }

    const agent = workflowState.agents[agentName];
    agent.status = status;

    if (status === 'running' && !agent.startTime) {
      agent.startTime = new Date().toISOString();
    }

    if ((status === 'completed' || status === 'failed') && result) {
      agent.endTime = new Date().toISOString();
      agent.result = {
        success: result.success,
        output: result.result || '',
        metrics: {
          duration: result.duration,
          filesCreated: 0
        }
      };

      if (result.error) {
        agent.error = result.error;
      }
    }

    await this.saveWorkflowState(workflowId, workflowState);
  }

  /**
   * Save agent result to separate result file
   */
  async saveAgentResult(
    workflowId: string,
    agentName: string,
    result: StructuredAgentResult
  ): Promise<void> {
    const simplifiedResult: SimplifiedAgentResult = {
      workflowId,
      agentName,
      stepIndex: result.stepIndex,
      status: result.status,
      timestamp: result.timestamp,
      output: result.output.result.join('\n'),
      success: result.output.success,
      artifacts: result.artifacts,
      handover: result.handover,
      metrics: {
        duration: result.metrics.duration,
        filesCreated: result.metrics.filesCreated
      }
    };

    const resultFile = join(this.resultsDir, workflowId, `${agentName}.json`);
    await fs.writeFile(resultFile, JSON.stringify(simplifiedResult, null, 2));

    // Also update the workflow state with handover data
    await this.updateAgentHandover(workflowId, agentName, result.handover);
  }

  /**
   * Update agent handover data in workflow state
   */
  private async updateAgentHandover(
    workflowId: string,
    agentName: string,
    handover?: StructuredAgentResult['handover']
  ): Promise<void> {
    if (!handover) return;

    const workflowState = await this.getWorkflowState(workflowId);
    if (workflowState.agents[agentName] && workflowState.agents[agentName].result) {
      workflowState.agents[agentName].result!.handover = {
        keyPoints: handover.keyPoints,
        instructions: handover.instructions
      };
      await this.saveWorkflowState(workflowId, workflowState);
    }
  }

  /**
   * Get workflow state
   */
  async getWorkflowState(workflowId: string): Promise<SimplifiedWorkflowState> {
    const workflowFile = join(this.workflowsDir, `${workflowId}.json`);
    try {
      const data = await fs.readFile(workflowFile, 'utf-8');
      return JSON.parse(data) as SimplifiedWorkflowState;
    } catch (error) {
      throw new Error(`Workflow ${workflowId} not found`);
    }
  }

  /**
   * Get agent result
   */
  async getAgentResult(workflowId: string, agentName: string): Promise<SimplifiedAgentResult | null> {
    const resultFile = join(this.resultsDir, workflowId, `${agentName}.json`);
    try {
      const data = await fs.readFile(resultFile, 'utf-8');
      return JSON.parse(data) as SimplifiedAgentResult;
    } catch {
      return null;
    }
  }

  /**
   * Get all results for a workflow
   */
  async getWorkflowResults(workflowId: string): Promise<SimplifiedAgentResult[]> {
    const workflowResultsDir = join(this.resultsDir, workflowId);
    try {
      const files = await fs.readdir(workflowResultsDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      const results: SimplifiedAgentResult[] = [];
      for (const file of jsonFiles) {
        const filePath = join(workflowResultsDir, file);
        const data = await fs.readFile(filePath, 'utf-8');
        results.push(JSON.parse(data) as SimplifiedAgentResult);
      }

      return results.sort((a, b) => a.stepIndex - b.stepIndex);
    } catch {
      return [];
    }
  }

  /**
   * List all workflows
   */
  async listWorkflows(): Promise<SimplifiedWorkflowState[]> {
    try {
      const files = await fs.readdir(this.workflowsDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      const workflows: SimplifiedWorkflowState[] = [];
      for (const file of jsonFiles) {
        const filePath = join(this.workflowsDir, file);
        const data = await fs.readFile(filePath, 'utf-8');
        workflows.push(JSON.parse(data) as SimplifiedWorkflowState);
      }

      return workflows.sort((a, b) =>
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
      );
    } catch {
      return [];
    }
  }

  /**
   * Delete workflow and its results
   */
  async deleteWorkflow(workflowId: string): Promise<void> {
    // Delete workflow state file
    const workflowFile = join(this.workflowsDir, `${workflowId}.json`);
    try {
      await fs.unlink(workflowFile);
    } catch {
      // File might not exist, that's okay
    }

    // Delete results directory
    const workflowResultsDir = join(this.resultsDir, workflowId);
    try {
      await fs.rmdir(workflowResultsDir, { recursive: true });
    } catch {
      // Directory might not exist, that's okay
    }
  }

  private async saveWorkflowState(workflowId: string, state: SimplifiedWorkflowState): Promise<void> {
    const workflowFile = join(this.workflowsDir, `${workflowId}.json`);
    await fs.writeFile(workflowFile, JSON.stringify(state, null, 2));
  }

  /**
   * Set pending task ID for workflow
   */
  async setPendingTask(workflowId: string, taskId: string | null): Promise<void> {
    const workflowState = await this.getWorkflowState(workflowId);
    workflowState.pendingTaskId = taskId || undefined;
    await this.saveWorkflowState(workflowId, workflowState);
  }

  /**
   * Get pending task ID for workflow
   */
  async getPendingTask(workflowId: string): Promise<string | null> {
    const workflowState = await this.getWorkflowState(workflowId);
    return workflowState.pendingTaskId || null;
  }
}