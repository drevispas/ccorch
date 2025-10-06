/**
 * Archival Service
 *
 * Purpose: Archive old workflows to prevent database bloat
 * Features:
 * - Delete COMPLETED workflows older than 30 days
 * - Delete FAILED workflows older than 90 days (kept longer for debugging)
 *
 * TODO: Add cron scheduler integration for automatic archival
 * For now, this must be triggered manually via admin API or script
 */

import { logger } from '../utils/logger.js';
import type { WorkflowRepository } from '../models/workflow-repository.js';

interface ArchivalResult {
  completedDeleted: number;
  failedDeleted: number;
}

/**
 * Archive old workflows based on retention policy
 *
 * Retention policy:
 * - COMPLETED workflows: Delete after 30 days
 * - FAILED workflows: Delete after 90 days (kept longer for debugging)
 *
 * @param workflowRepo - Workflow repository instance
 * @returns Object with counts of deleted workflows by status
 */
export async function archiveOldWorkflows(
  workflowRepo: WorkflowRepository
): Promise<ArchivalResult> {
  logger.info('Starting workflow archival');

  const result: ArchivalResult = {
    completedDeleted: 0,
    failedDeleted: 0
  };

  try {
    // Archive COMPLETED workflows older than 30 days
    const completedThresholdDays = 30;
    logger.info(
      { status: 'COMPLETED', thresholdDays: completedThresholdDays },
      'Archiving old COMPLETED workflows'
    );

    const oldCompletedWorkflows = await workflowRepo.findOldWorkflows(
      'COMPLETED',
      completedThresholdDays
    );

    logger.info(
      { count: oldCompletedWorkflows.length },
      'Found old COMPLETED workflows'
    );

    for (const workflow of oldCompletedWorkflows) {
      try {
        await workflowRepo.deleteWorkflow(workflow.id);
        result.completedDeleted++;

        logger.debug(
          { workflowId: workflow.id, updatedAt: workflow.updatedAt },
          'Deleted COMPLETED workflow'
        );
      } catch (error) {
        logger.error(
          { workflowId: workflow.id, error },
          'Failed to delete COMPLETED workflow'
        );
        // Continue with other workflows even if one fails
      }
    }

    // Archive FAILED workflows older than 90 days
    const failedThresholdDays = 90;
    logger.info(
      { status: 'FAILED', thresholdDays: failedThresholdDays },
      'Archiving old FAILED workflows'
    );

    const oldFailedWorkflows = await workflowRepo.findOldWorkflows(
      'FAILED',
      failedThresholdDays
    );

    logger.info(
      { count: oldFailedWorkflows.length },
      'Found old FAILED workflows'
    );

    for (const workflow of oldFailedWorkflows) {
      try {
        await workflowRepo.deleteWorkflow(workflow.id);
        result.failedDeleted++;

        logger.debug(
          { workflowId: workflow.id, updatedAt: workflow.updatedAt },
          'Deleted FAILED workflow'
        );
      } catch (error) {
        logger.error(
          { workflowId: workflow.id, error },
          'Failed to delete FAILED workflow'
        );
        // Continue with other workflows even if one fails
      }
    }

    logger.info(
      {
        completedDeleted: result.completedDeleted,
        failedDeleted: result.failedDeleted,
        totalDeleted: result.completedDeleted + result.failedDeleted
      },
      'Workflow archival completed'
    );

    return result;
  } catch (error) {
    logger.error({ error }, 'Workflow archival failed');
    throw error;
  }
}

/**
 * Future Cron Scheduler Integration:
 *
 * Option 1: Use node-cron package
 * ```typescript
 * import cron from 'node-cron';
 *
 * // Run daily at 2 AM
 * cron.schedule('0 2 * * *', async () => {
 *   try {
 *     const result = await archiveOldWorkflows(workflowRepo);
 *     logger.info(result, 'Scheduled archival completed');
 *   } catch (error) {
 *     logger.error({ error }, 'Scheduled archival failed');
 *   }
 * });
 * ```
 *
 * Option 2: Use external cron job
 * Create admin API endpoint and call via curl:
 * ```bash
 * curl -X POST http://localhost:3000/admin/archive \
 *   -H "Authorization: Bearer $API_KEY_ADMIN"
 * ```
 *
 * Add to crontab:
 * ```cron
 * 0 2 * * * curl -X POST http://localhost:3000/admin/archive -H "Authorization: Bearer $API_KEY_ADMIN"
 * ```
 */
