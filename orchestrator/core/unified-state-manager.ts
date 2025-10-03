import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  StructuredAgentResult,
  UnifiedWorkflowState,
  PreviousResults,
  TextSplitter
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Utility function to split long text into readable lines
 */
const splitIntoLines: TextSplitter = (text: string, maxLength = 100): string[] => {
  if (!text) return [];
  return text.split('\n').flatMap(line => {
    if (line.length <= maxLength) return [line];
    const chunks = [];
    for (let i = 0; i < line.length; i += maxLength) {
      chunks.push(line.slice(i, i + maxLength));
    }
    return chunks;
  });
};

/**
 * UnifiedStateManager consolidates all workflow state management into a single system.
 *
 * This replaces the fragmented approach of having separate:
 * - index.json files
 * - workflow-results.json files
 * - Multiple result.json and summary.md files
 *
 * Instead, it provides:
 * - Single workflow state file per workflow
 * - Optimized data structures with split lines for readability
 * - Elimination of redundant markdown files
 * - Better performance through reduced file I/O
 */
export class UnifiedStateManager {
  private readonly workflowsBaseDir: string;

  constructor() {
    this.workflowsBaseDir = join(__dirname, '../state');
  }

  async initialize(): Promise<void> {
    await this.ensureDirectoryExists(this.workflowsBaseDir);
    await this.ensureDirectoryExists(join(this.workflowsBaseDir, 'active'));
    await this.ensureDirectoryExists(join(this.workflowsBaseDir, 'completed'));
  }

  /**
   * Save agent result to unified workflow state
   */
  async saveAgentResult(
    workflowId: string,
    stepIndex: number,
    agentName: string,
    result: StructuredAgentResult
  ): Promise<void> {
    const workflowStateFile = this.getWorkflowStateFile(workflowId);

    // Load existing state or create new one
    let state: UnifiedWorkflowState;
    try {
      const stateContent = await fs.readFile(workflowStateFile, 'utf-8');
      state = JSON.parse(stateContent);
    } catch {
      state = {
        id: workflowId,
        workflowType: 'unknown',
        status: 'running',
        agents: {},
        timestamps: {
          start: new Date().toISOString()
        }
      };
    }

    // Process result for optimal readability
    const processedResult = this.processResultForReadability(result);

    // Update agent state
    state.agents[agentName] = {
      step: stepIndex,
      status: processedResult.status,
      resultPath: `step-${String(stepIndex).padStart(2, '0')}-${agentName}`,
      timestamp: processedResult.timestamp,
      output: processedResult.output.result
    };

    // Write unified state back to file
    await this.ensureDirectoryExists(dirname(workflowStateFile));
    await fs.writeFile(workflowStateFile, JSON.stringify(state, null, 2));

    // Also create minimal individual result file for backward compatibility
    const resultDir = join(dirname(workflowStateFile), 'results', `${String(stepIndex).padStart(2, '0')}-${agentName}`);
    await this.ensureDirectoryExists(resultDir);
    await this.ensureDirectoryExists(join(resultDir, 'artifacts'));

    const resultFile = join(resultDir, 'result.json');
    await fs.writeFile(resultFile, JSON.stringify(processedResult, null, 2));

    console.log(`📁 Saved ${agentName} to unified state and result file`);
  }

  /**
   * Get complete workflow state
   */
  async getWorkflowState(workflowId: string): Promise<UnifiedWorkflowState | null> {
    try {
      const stateFile = this.getWorkflowStateFile(workflowId);
      const content = await fs.readFile(stateFile, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Get previous results for an agent
   */
  async getPreviousResults(
    workflowId: string,
    currentStep: number
  ): Promise<PreviousResults[]> {
    const workflowDir = this.getWorkflowDir(workflowId);
    const resultsDir = join(workflowDir, 'results');

    try {
      const entries = await fs.readdir(resultsDir, { withFileTypes: true });
      const previousResults: PreviousResults[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const stepMatch = entry.name.match(/^(\d+)-(.+)$/);
        if (!stepMatch) continue;

        const stepIndex = parseInt(stepMatch[1]);
        if (stepIndex >= currentStep) continue;

        const agentName = stepMatch[2];
        const resultPath = join(resultsDir, entry.name);
        const resultFile = join(resultPath, 'result.json');

        try {
          const resultContent = await fs.readFile(resultFile, 'utf-8');
          const result = JSON.parse(resultContent) as StructuredAgentResult;

          previousResults.push({
            agent: agentName,
            stepIndex,
            resultPath,
            result,
            available: true
          });
        } catch (error) {
          console.warn(`⚠️ Could not read result for ${agentName} at step ${stepIndex}:`, error);
          previousResults.push({
            agent: agentName,
            stepIndex,
            resultPath,
            result: {} as StructuredAgentResult,
            available: false
          });
        }
      }

      return previousResults.sort((a, b) => a.stepIndex - b.stepIndex);
    } catch (error) {
      console.warn(`⚠️ Could not read previous results for workflow ${workflowId}:`, error);
      return [];
    }
  }

  /**
   * Update workflow status
   */
  async updateWorkflowStatus(workflowId: string, status: string, workflowType?: string): Promise<void> {
    const stateFile = this.getWorkflowStateFile(workflowId);

    let state: UnifiedWorkflowState;
    try {
      const content = await fs.readFile(stateFile, 'utf-8');
      state = JSON.parse(content);
    } catch {
      state = {
        id: workflowId,
        workflowType: workflowType || 'unknown',
        status: 'running',
        agents: {},
        timestamps: {
          start: new Date().toISOString()
        }
      };
    }

    state.status = status;
    if (workflowType) {
      state.workflowType = workflowType;
    }

    if (status === 'completed' || status === 'failed') {
      state.timestamps.end = new Date().toISOString();
    }

    await this.ensureDirectoryExists(dirname(stateFile));
    await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
  }

  /**
   * Archive completed workflow
   */
  async archiveWorkflow(workflowId: string): Promise<string> {
    const activeDir = join(this.workflowsBaseDir, 'active', workflowId);
    const archiveDir = join(this.workflowsBaseDir, 'completed', workflowId);

    try {
      await this.ensureDirectoryExists(dirname(archiveDir));
      await fs.rename(activeDir, archiveDir);
      console.log(`📦 Archived workflow: ${workflowId}`);
      return archiveDir;
    } catch (error) {
      console.warn(`⚠️ Failed to archive workflow ${workflowId}:`, error);
      throw error;
    }
  }

  /**
   * Process agent result for better readability
   */
  private processResultForReadability(result: StructuredAgentResult): StructuredAgentResult {
    // Split output result into lines for better readability
    const resultText = typeof result.output === 'object' && result.output.result
      ? (Array.isArray(result.output.result) ? result.output.result.join('\n') : result.output.result)
      : result.output?.toString() || '';

    const processedOutput = {
      result: splitIntoLines(resultText),
      success: result.output?.success ?? true
    };

    // Create clean result object, only including non-empty optional fields
    const cleanResult: StructuredAgentResult = {
      agent: result.agent,
      timestamp: result.timestamp,
      status: result.status,
      stepIndex: result.stepIndex,
      workflowId: result.workflowId,
      output: processedOutput,
      metrics: result.metrics
    };

    // Only add artifacts if they exist
    if (result.artifacts && Object.keys(result.artifacts).length > 0) {
      cleanResult.artifacts = result.artifacts;
    }

    // Only add handover data if it has meaningful content
    if (result.handover) {
      const handover: any = {};

      if (result.handover.keyPoints && result.handover.keyPoints.length > 0) {
        handover.keyPoints = result.handover.keyPoints;
      }

      if (result.handover.instructions && result.handover.instructions.trim() !== '') {
        handover.instructions = result.handover.instructions;
      }

      if (result.handover.dependencies && result.handover.dependencies.length > 0) {
        handover.dependencies = result.handover.dependencies;
      }

      if (result.handover.data && Object.keys(result.handover.data).length > 0) {
        handover.data = result.handover.data;
      }

      // Only add handover if it has any content
      if (Object.keys(handover).length > 0) {
        cleanResult.handover = handover;
      }
    }

    return cleanResult;
  }

  private getWorkflowDir(workflowId: string): string {
    return join(this.workflowsBaseDir, 'active', workflowId);
  }

  private getWorkflowStateFile(workflowId: string): string {
    return join(this.getWorkflowDir(workflowId), 'workflow-state.json');
  }

  private async ensureDirectoryExists(dir: string): Promise<void> {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }
}