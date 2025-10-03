import * as fs from 'fs';
import * as path from 'path';
import { AgentResult, TaskResult } from './types/common.types';

export class ResultFileManager {
  private resultsDir: string;
  private initialized: boolean = false;

  constructor(resultsDir: string = './results') {
    this.resultsDir = resultsDir;
    this.ensureDirectoryExists();
  }

  async initialize(): Promise<void> {
    this.ensureDirectoryExists();
    this.initialized = true;
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  saveResult(taskId: string, result: TaskResult): string {
    const filename = `${taskId}_${Date.now()}.json`;
    const filepath = path.join(this.resultsDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
    return filepath;
  }

  getResult(filename: string): TaskResult | null {
    const filepath = path.join(this.resultsDir, filename);
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, 'utf-8')) as TaskResult;
    }
    return null;
  }

  listResults(): string[] {
    return fs.readdirSync(this.resultsDir)
      .filter(file => file.endsWith('.json'));
  }

  createWorkflowDirectory(workflowId: string): string {
    const workflowDir = path.join(this.resultsDir, workflowId);
    if (!fs.existsSync(workflowDir)) {
      fs.mkdirSync(workflowDir, { recursive: true });
    }
    return workflowDir;
  }

  writeAgentResult(workflowId: string, agentName: string, result: AgentResult): string {
    const workflowDir = this.createWorkflowDirectory(workflowId);
    const filename = `${agentName}_${Date.now()}.json`;
    const filepath = path.join(workflowDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
    return filepath;
  }

  readPreviousResults(workflowId: string): AgentResult[] {
    const workflowDir = path.join(this.resultsDir, workflowId);
    if (!fs.existsSync(workflowDir)) {
      return [];
    }

    const files = fs.readdirSync(workflowDir)
      .filter(file => file.endsWith('.json'))
      .sort();

    return files.map(file => {
      const filepath = path.join(workflowDir, file);
      return JSON.parse(fs.readFileSync(filepath, 'utf-8')) as AgentResult;
    });
  }

  convertLegacyResult(result: unknown): AgentResult {
    // Convert legacy results to new format
    if (typeof result === 'object' && result !== null && 'success' in result) {
      return result as AgentResult;
    }

    return {
      success: true,
      data: result,
      metadata: {
        converted: true,
        timestamp: new Date().toISOString()
      }
    };
  }
}