/**
 * Stop Hook Handler
 *
 * WBS Task: 6.1 Hook Adapters
 * PRD Reference: §5.1 (Hook Processing)
 *
 * Handles Stop hook events from Claude Code.
 * Cleans up orphaned workflows when sessions terminate.
 */

import type { IWorkflowRepository } from '../types/repositories';

/**
 * Handle Stop hook event
 *
 * Marks all active workflows as FAILED with reason "Session terminated".
 * This prevents orphaned workflows from lingering in the database.
 *
 * Note: Stop hook does not return messages to Claude Code (PRD §5.1).
 *
 * @param workflowRepo - Workflow repository instance
 */
export async function handleStop(workflowRepo: IWorkflowRepository): Promise<void> {
  try {
    // 1. Find all active workflows
    const activeWorkflows = await workflowRepo.findActive();

    // 2. Mark each as FAILED
    for (const workflow of activeWorkflows) {
      await workflowRepo.updateStatus(workflow.id, 'FAILED');
    }
  } catch (error) {
    // Log error but don't throw (stop hook should be fault-tolerant)
    console.error('Error in Stop hook handler:', error);
  }
}
