#!/usr/bin/env node

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SimplifiedStateManager, SimplifiedWorkflowState } from './simplified-state-manager.js';
import { WorkflowState, StructuredAgentResult } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Migration script to convert existing complex state structure to simplified format
 */
class StateMigrator {
  private oldStateDir: string;
  private simplifiedManager: SimplifiedStateManager;

  constructor() {
    this.oldStateDir = join(__dirname, '../state');
    this.simplifiedManager = new SimplifiedStateManager();
  }

  async migrate(): Promise<void> {
    console.log('Starting migration to simplified state structure...');

    // Initialize the simplified state manager
    await this.simplifiedManager.initialize();

    // Migrate existing workflows
    await this.migrateWorkflows();

    console.log('Migration completed successfully!');
  }

  private async migrateWorkflows(): Promise<void> {
    try {
      // Check if old state directory exists
      await fs.access(this.oldStateDir);
    } catch {
      console.log('No existing state directory found. Starting with clean state.');
      return;
    }

    // Get all workflow state files from the old structure
    const workflowFiles = await this.getOldWorkflowFiles();

    console.log(`Found ${workflowFiles.length} workflows to migrate`);

    for (const workflowFile of workflowFiles) {
      await this.migrateWorkflow(workflowFile);
    }
  }

  private async getOldWorkflowFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.oldStateDir);
      return files.filter(file => file.startsWith('wf_') && file.endsWith('.json'));
    } catch {
      return [];
    }
  }

  private async migrateWorkflow(workflowFileName: string): Promise<void> {
    const workflowId = workflowFileName.replace('.json', '');
    const oldWorkflowFile = join(this.oldStateDir, workflowFileName);

    try {
      console.log(`Migrating workflow: ${workflowId}`);

      // Read old workflow state
      const oldStateData = await fs.readFile(oldWorkflowFile, 'utf-8');
      const oldState = JSON.parse(oldStateData) as WorkflowState;

      // Extract agent names from step states
      const agentNames = oldState.stepStates.map(step => step.agentName);

      // Create new workflow in simplified format
      await this.simplifiedManager.createWorkflow(
        oldState.id,
        oldState.workflowName,
        oldState.taskDescription,
        agentNames
      );

      // Update workflow status
      await this.simplifiedManager.updateWorkflowStatus(oldState.id, oldState.status);

      // Migrate agent results
      await this.migrateAgentResults(oldState);

      console.log(`Migrated workflow: ${workflowId}`);
    } catch (error) {
      console.error(`Failed to migrate workflow ${workflowId}:`, error);
    }
  }

  private async migrateAgentResults(oldState: WorkflowState): Promise<void> {
    const activeWorkflowDir = join(this.oldStateDir, 'active', oldState.id);

    try {
      // Check if active workflow directory exists
      await fs.access(activeWorkflowDir);
    } catch {
      // No active workflow data, just migrate step states
      for (const stepState of oldState.stepStates) {
        if (stepState.status === 'completed' && stepState.result) {
          await this.simplifiedManager.updateAgentStatus(
            oldState.id,
            stepState.agentName,
            'completed',
            {
              success: true,
              result: stepState.result,
              duration: 0
            }
          );
        }
      }
      return;
    }

    // Migrate results from the complex structure
    const resultsDir = join(activeWorkflowDir, 'results');
    try {
      const agentDirs = await fs.readdir(resultsDir);

      for (const agentDir of agentDirs) {
        const resultFile = join(resultsDir, agentDir, 'result.json');
        try {
          const resultData = await fs.readFile(resultFile, 'utf-8');
          const structuredResult = JSON.parse(resultData) as StructuredAgentResult;

          // Save to simplified format
          await this.simplifiedManager.saveAgentResult(
            oldState.id,
            structuredResult.agent,
            structuredResult
          );

          // Update agent status
          await this.simplifiedManager.updateAgentStatus(
            oldState.id,
            structuredResult.agent,
            structuredResult.status === 'completed' ? 'completed' : 'failed',
            {
              success: structuredResult.output.success,
              result: structuredResult.output.result.join('\n'),
              duration: structuredResult.metrics.duration
            }
          );

          console.log(`  Migrated result for agent: ${structuredResult.agent}`);
        } catch (error) {
          console.error(`  Failed to migrate result for ${agentDir}:`, error);
        }
      }
    } catch {
      console.log(`  No results directory found for workflow ${oldState.id}`);
    }
  }

  /**
   * Backup the old state directory before migration
   */
  async backup(): Promise<void> {
    const backupDir = join(this.oldStateDir, '..', 'state-backup');

    try {
      await fs.access(this.oldStateDir);
      console.log('Creating backup of existing state...');

      // Create backup directory
      await fs.mkdir(backupDir, { recursive: true });

      // Copy all files
      await this.copyDirectory(this.oldStateDir, backupDir);

      console.log('Backup created at:', backupDir);
    } catch {
      console.log('No existing state to backup');
    }
  }

  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });

    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const migrator = new StateMigrator();

  // Backup existing state first
  await migrator.backup();

  // Then migrate
  await migrator.migrate();
}

export { StateMigrator };