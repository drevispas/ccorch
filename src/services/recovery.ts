/**
 * Recovery Service
 *
 * Purpose: Provide failure recovery mechanisms for transient errors and stale workflows
 * Features:
 * - Retry policy with exponential backoff
 * - Stale workflow cleanup
 */

import { logger } from '../utils/logger.js';
import type { WorkflowRepository } from '../models/workflow-repository.js';

/**
 * Retry a function with exponential backoff
 *
 * @param fn - Async function to retry
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param delayMs - Initial delay in milliseconds (default: 1000)
 * @returns Promise resolving to function result
 * @throws Error if max retries exceeded
 *
 * Exponential backoff formula: delayMs * (2 ^ attemptNumber)
 * Example: 1000ms, 2000ms, 4000ms, 8000ms
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        logger.error(
          { error: lastError, attempt, maxRetries },
          'Max retries exceeded'
        );
        throw lastError;
      }

      // Calculate exponential backoff delay
      const backoffDelay = delayMs * Math.pow(2, attempt);

      logger.warn(
        {
          error: lastError.message,
          attempt: attempt + 1,
          maxRetries,
          nextRetryIn: `${backoffDelay}ms`
        },
        'Retrying after error'
      );

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError!;
}

/**
 * Clean up stale workflows that haven't been updated in a while
 *
 * @param workflowRepo - Workflow repository instance
 * @param staleThresholdMs - Time threshold in milliseconds (default: 1 hour)
 * @returns Number of workflows cleaned up
 *
 * Workflows are considered stale if:
 * - Status is ACTIVE
 * - updatedAt is older than (now - staleThresholdMs)
 *
 * Stale workflows are marked as FAILED with reason "Workflow stale"
 */
export async function cleanupStaleWorkflows(
  workflowRepo: WorkflowRepository,
  staleThresholdMs = 3600000 // 1 hour default
): Promise<number> {
  logger.info(
    { staleThresholdMs, thresholdHours: staleThresholdMs / 3600000 },
    'Starting stale workflow cleanup'
  );

  try {
    // Find all stale workflows
    const staleWorkflows = await workflowRepo.findActiveStaleWorkflows(
      staleThresholdMs
    );

    if (staleWorkflows.length === 0) {
      logger.info('No stale workflows found');
      return 0;
    }

    logger.info(
      { count: staleWorkflows.length },
      'Found stale workflows to clean up'
    );

    // Mark each stale workflow as FAILED
    let cleanedCount = 0;
    for (const workflow of staleWorkflows) {
      try {
        await workflowRepo.updateStatus(workflow.id, 'FAILED');
        cleanedCount++;

        logger.info(
          { workflowId: workflow.id, updatedAt: workflow.updatedAt },
          'Marked stale workflow as FAILED'
        );
      } catch (error) {
        logger.error(
          { workflowId: workflow.id, error },
          'Failed to mark workflow as FAILED'
        );
        // Continue with other workflows even if one fails
      }
    }

    logger.info(
      { cleanedCount, totalFound: staleWorkflows.length },
      'Stale workflow cleanup completed'
    );

    return cleanedCount;
  } catch (error) {
    logger.error({ error }, 'Stale workflow cleanup failed');
    throw error;
  }
}
