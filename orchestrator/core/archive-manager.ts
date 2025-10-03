import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { WorkflowState } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ArchiveConfig {
  retentionDays: number;
  compressAfterDays: number;
  testWorkflowThresholdMs: number;
  maxArchiveSizeMB: number;
}

interface WorkflowSummary {
  id: string;
  workflowName: string;
  taskDescription: string;
  status: string;
  duration: number;
  agentCount: number;
  successRate: number;
  startTime: Date;
  endTime: Date;
}

export class ArchiveManager {
  private archiveBaseDir: string;
  private config: ArchiveConfig;

  constructor(config?: Partial<ArchiveConfig>) {
    this.archiveBaseDir = join(__dirname, '../archive');
    this.config = {
      retentionDays: 30,
      compressAfterDays: 7,
      testWorkflowThresholdMs: 5,
      maxArchiveSizeMB: 100,
      ...config
    };
  }

  async initialize(): Promise<void> {
    await this.ensureArchiveDirectory();
  }

  /**
   * Archive a workflow with proper organization
   */
  async archiveWorkflow(state: WorkflowState): Promise<string> {
    const archivePath = await this.createArchivePath(state);

    // Create archive directory
    await fs.mkdir(archivePath, { recursive: true });

    // Save workflow state as JSON
    const stateFile = join(archivePath, 'workflow-state.json');
    const enrichedState = await this.enrichWorkflowState(state);
    await fs.writeFile(stateFile, JSON.stringify(enrichedState, null, 2));

    // Create summary README
    const readmeFile = join(archivePath, 'README.md');
    const summary = this.generateWorkflowSummary(enrichedState);
    await fs.writeFile(readmeFile, summary);

    // Create context file if available
    if (state.context && Object.keys(state.context).length > 0) {
      const contextFile = join(archivePath, 'final-context.md');
      await fs.writeFile(contextFile, this.formatContext(state.context));
    }

    return archivePath;
  }

  /**
   * Clean up old archives based on retention policy
   */
  async cleanup(): Promise<{ removed: number, compressed: number }> {
    const stats = { removed: 0, compressed: 0 };
    const now = new Date();
    const retentionDate = new Date(now.getTime() - (this.config.retentionDays * 24 * 60 * 60 * 1000));
    const compressionDate = new Date(now.getTime() - (this.config.compressAfterDays * 24 * 60 * 60 * 1000));

    const yearDirs = await this.getYearDirectories();

    for (const yearDir of yearDirs) {
      const monthDirs = await this.getMonthDirectories(yearDir);

      for (const monthDir of monthDirs) {
        const workflowDirs = await this.getWorkflowDirectories(monthDir);

        for (const workflowDir of workflowDirs) {
          const archiveDate = await this.getArchiveDate(workflowDir);

          if (archiveDate < retentionDate) {
            await fs.rm(workflowDir, { recursive: true, force: true });
            stats.removed++;
          } else if (archiveDate < compressionDate) {
            await this.compressArchive(workflowDir);
            stats.compressed++;
          }
        }
      }
    }

    return stats;
  }

  /**
   * Remove test workflow archives
   */
  async removeTestWorkflows(): Promise<number> {
    let removed = 0;
    const yearDirs = await this.getYearDirectories();

    for (const yearDir of yearDirs) {
      const monthDirs = await this.getMonthDirectories(yearDir);

      for (const monthDir of monthDirs) {
        const workflowDirs = await this.getWorkflowDirectories(monthDir);

        for (const workflowDir of workflowDirs) {
          if (await this.isTestWorkflow(workflowDir)) {
            await fs.rm(workflowDir, { recursive: true, force: true });
            removed++;
          }
        }
      }
    }

    return removed;
  }

  /**
   * Get workflow summaries for a date range
   */
  async getWorkflowSummaries(startDate?: Date, endDate?: Date): Promise<WorkflowSummary[]> {
    const summaries: WorkflowSummary[] = [];
    const yearDirs = await this.getYearDirectories();

    for (const yearDir of yearDirs) {
      const monthDirs = await this.getMonthDirectories(yearDir);

      for (const monthDir of monthDirs) {
        const workflowDirs = await this.getWorkflowDirectories(monthDir);

        for (const workflowDir of workflowDirs) {
          try {
            const stateFile = join(workflowDir, 'workflow-state.json');
            const stateContent = await fs.readFile(stateFile, 'utf-8');
            const state = JSON.parse(stateContent) as WorkflowState;

            const archiveDate = new Date(state.startTime);
            if (startDate && archiveDate < startDate) continue;
            if (endDate && archiveDate > endDate) continue;

            summaries.push(this.createWorkflowSummary(state));
          } catch (error) {
            console.warn(`Failed to read workflow state from ${workflowDir}:`, error);
          }
        }
      }
    }

    return summaries.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  /**
   * Migrate flat archive files to organized structure
   */
  async migrateFlatArchives(flatArchiveDir?: string): Promise<number> {
    const sourceDir = flatArchiveDir || this.archiveBaseDir;
    let migrated = 0;

    try {
      const files = await fs.readdir(sourceDir);
      const jsonFiles = files.filter(f => f.endsWith('.json') && f.startsWith('wf_'));

      for (const file of jsonFiles) {
        try {
          const filePath = join(sourceDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const state = JSON.parse(content) as WorkflowState;

          // Archive using new structure
          await this.archiveWorkflow(state);

          // Remove old file
          await fs.unlink(filePath);
          migrated++;
        } catch (error) {
          console.warn(`Failed to migrate ${file}:`, error);
        }
      }
    } catch (error) {
      console.warn('Failed to read flat archive directory:', error);
    }

    return migrated;
  }

  private async createArchivePath(state: WorkflowState): Promise<string> {
    const date = new Date(state.startTime);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const monthName = date.toLocaleString('en-US', { month: 'long' });
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');

    // Clean task description for filename
    const taskSlug = state.taskDescription
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 30);

    const dirname = `${day}-${hour}${minute}-${taskSlug}`;

    return join(this.archiveBaseDir, String(year), `${month}-${monthName}`, dirname);
  }

  private async enrichWorkflowState(state: WorkflowState): Promise<WorkflowState & { metrics: any }> {
    const duration = state.endTime ?
      new Date(state.endTime).getTime() - new Date(state.startTime).getTime() : 0;

    const completedSteps = state.stepStates?.filter(s => s.status === 'completed').length || 0;
    const totalSteps = state.stepStates?.length || 0;
    const successRate = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

    const stepDurations: Record<string, number> = {};
    state.stepStates?.forEach(step => {
      if (step.startTime && step.endTime) {
        const stepDuration = new Date(step.endTime).getTime() - new Date(step.startTime).getTime();
        stepDurations[step.agentName] = stepDuration;
      }
    });

    return {
      ...state,
      metrics: {
        workflowId: state.id,
        workflowName: state.workflowName,
        totalDuration: duration,
        stepDurations,
        successRate,
        errorCount: state.stepStates?.filter(s => s.status === 'failed').length || 0,
        retryCount: state.stepStates?.reduce((acc, s) => acc + (s.retryCount || 0), 0) || 0,
        archivedAt: new Date()
      }
    };
  }

  private generateWorkflowSummary(state: WorkflowState & { metrics: any }): string {
    const date = new Date(state.startTime).toLocaleDateString();
    const time = new Date(state.startTime).toLocaleTimeString();
    const duration = `${state.metrics.totalDuration}ms`;

    return `# Workflow Summary

## Overview
- **Task**: ${state.taskDescription}
- **Workflow**: ${state.workflowName}
- **Status**: ${state.status}
- **Date**: ${date} ${time}
- **Duration**: ${duration}
- **Success Rate**: ${state.metrics.successRate}%

## Execution Steps
${state.stepStates?.map((step, i) =>
  `${i + 1}. **${step.agentName}**: ${step.status} (${step.endTime && step.startTime ?
    new Date(step.endTime).getTime() - new Date(step.startTime).getTime() : 0}ms)`
).join('\n') || 'No steps recorded'}

## Agent Performance
${Object.entries(state.metrics.stepDurations || {})
  .map(([agent, duration]) => `- **${agent}**: ${duration}ms`)
  .join('\n') || 'No performance data'}

## Artifacts
- \`workflow-state.json\`: Complete workflow state
${state.context && Object.keys(state.context).length > 0 ? '- `final-context.md`: Workflow context and decisions' : ''}

---
*Archived on ${new Date().toISOString()}*
`;
  }

  private formatContext(context: any): string {
    return `# Workflow Context

${Object.entries(context)
  .map(([key, value]) => `## ${key}\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``)
  .join('\n\n')}
`;
  }

  private createWorkflowSummary(state: WorkflowState): WorkflowSummary {
    const startTime = new Date(state.startTime);
    const endTime = state.endTime ? new Date(state.endTime) : startTime;
    const duration = endTime.getTime() - startTime.getTime();
    const completedSteps = state.stepStates?.filter(s => s.status === 'completed').length || 0;
    const totalSteps = state.stepStates?.length || 0;
    const successRate = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

    return {
      id: state.id,
      workflowName: state.workflowName,
      taskDescription: state.taskDescription,
      status: state.status,
      duration,
      agentCount: totalSteps,
      successRate,
      startTime,
      endTime
    };
  }

  private async ensureArchiveDirectory(): Promise<void> {
    await fs.mkdir(this.archiveBaseDir, { recursive: true });
  }

  private async getYearDirectories(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.archiveBaseDir, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory() && /^\d{4}$/.test(entry.name))
        .map(entry => join(this.archiveBaseDir, entry.name));
    } catch {
      return [];
    }
  }

  private async getMonthDirectories(yearDir: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(yearDir, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory() && /^\d{2}-/.test(entry.name))
        .map(entry => join(yearDir, entry.name));
    } catch {
      return [];
    }
  }

  private async getWorkflowDirectories(monthDir: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(monthDir, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => join(monthDir, entry.name));
    } catch {
      return [];
    }
  }

  private async getArchiveDate(workflowDir: string): Promise<Date> {
    try {
      const stateFile = join(workflowDir, 'workflow-state.json');
      const content = await fs.readFile(stateFile, 'utf-8');
      const state = JSON.parse(content);
      return new Date(state.startTime);
    } catch {
      // Fallback to directory creation time
      const stats = await fs.stat(workflowDir);
      return stats.birthtime;
    }
  }

  private async isTestWorkflow(workflowDir: string): Promise<boolean> {
    try {
      const stateFile = join(workflowDir, 'workflow-state.json');
      const content = await fs.readFile(stateFile, 'utf-8');
      const state = JSON.parse(content);

      const duration = state.endTime ?
        new Date(state.endTime).getTime() - new Date(state.startTime).getTime() : 0;

      return duration < this.config.testWorkflowThresholdMs;
    } catch {
      return false;
    }
  }

  private async compressArchive(workflowDir: string): Promise<void> {
    // Create compression metadata file for future implementation
    const compressionInfo = {
      compressed: false,
      reason: 'Compression not implemented - archive stored uncompressed for readability',
      archivedAt: new Date().toISOString(),
      size: await this.getDirectorySize(workflowDir)
    };

    const compressedMarker = join(workflowDir, '.compression-info.json');
    await fs.writeFile(compressedMarker, JSON.stringify(compressionInfo, null, 2));
  }

  private async getDirectorySize(dir: string): Promise<number> {
    let totalSize = 0;
    try {
      const files = await fs.readdir(dir, { withFileTypes: true });
      for (const file of files) {
        const filePath = join(dir, file.name);
        if (file.isDirectory()) {
          totalSize += await this.getDirectorySize(filePath);
        } else {
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
        }
      }
    } catch (error) {
      console.warn(`Could not calculate size for ${dir}: ${(error as Error).message}`);
    }
    return totalSize;
  }
}