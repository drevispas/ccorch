/**
 * Claude Code Orchestrator Server
 *
 * Main entry point for CCOrch
 * WBS Task: 6.2 HTTP Endpoint Integration
 */

import express, { type Express } from 'express';
import { PrismaClient } from '@prisma/client';
import { validateAgentConfig } from './config/validator.js';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';
import { createHookRouter } from './api/hooks.js';
import { createWorkflowsRouter } from './api/workflows.js';
import { authenticateHook } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { Orchestrator } from './services/orchestrator.js';
import { StateManager } from './services/state-manager.js';
import { WorkflowRepository } from './models/workflow-repository.js';
import { AgentResultRepository } from './models/agent-result-repository.js';
import { TransitionRepository } from './models/transition-repository.js';

/**
 * Startup validation
 * Validates that all required agent configurations exist before starting server
 */
async function validateStartup(): Promise<void> {
  try {
    // Validate agent configuration (WBS 6.4)
    // Ensures all 21 agent configurations are present (7 roles × 3 complexity levels)
    const configResult = validateAgentConfig();
    logger.info(
      {
        totalConfigurations: configResult.totalConfigurations,
        roles: configResult.roles.length,
        complexityLevels: configResult.complexityLevels.length,
      },
      'Agent configuration validation passed'
    );
  } catch (error) {
    logger.error({ error }, 'Startup validation failed');
    throw error;
  }
}

/**
 * Create and configure Express app
 */
export async function startServer(): Promise<Express> {
  // Validate configuration before starting server
  await validateStartup();

  // Initialize Prisma
  const prisma = new PrismaClient();

  // Initialize repositories
  const workflowRepo = new WorkflowRepository(prisma);
  const agentResultRepo = new AgentResultRepository(prisma);
  const transitionRepo = new TransitionRepository(prisma);

  // Initialize services
  const stateManager = new StateManager(workflowRepo, transitionRepo);
  const orchestrator = new Orchestrator(stateManager, agentResultRepo);

  // Create Express app
  const app = express();

  // Middleware
  app.use(express.json());

  // Error handling for invalid JSON
  app.use((err: any, req: any, res: any, next: any) => {
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    next(err); // Pass error to next error handler
  });

  // Register hook routes with authentication middleware
  const hookRouter = createHookRouter(orchestrator, workflowRepo);
  app.use('/hooks', authenticateHook, hookRouter);

  // Register API routes (WBS 7.1)
  const workflowsRouter = createWorkflowsRouter(orchestrator, workflowRepo);
  app.use('/api/workflows', workflowsRouter);

  // Global error handler (must be last middleware - WBS 7.5)
  app.use(errorHandler);

  logger.info('Server startup complete');

  return app;
}

/**
 * Start server and listen on port
 */
async function listen(): Promise<void> {
  const app = await startServer();
  const port = env.PORT;

  app.listen(port, () => {
    logger.info({ port }, `CCOrch listening on port ${port}`);
  });
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  listen().catch((error) => {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  });
}

export { validateStartup };
