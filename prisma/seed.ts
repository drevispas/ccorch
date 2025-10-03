/**
 * Prisma Seed Script
 *
 * Purpose: Populate database with sample workflow data for local development
 * Usage: pnpm prisma db seed
 * Reset DB + Seed: pnpm prisma migrate reset --force
 *
 * Sample Data:
 * - 1 Workflow: backend-development chain at moderate complexity
 * - 3 Agent Results: architect → backend-developer → reviewer
 * - 2 Transitions: documenting state changes between agents
 */

import { getPrismaClient, disconnectDatabase } from '../src/config/database';
import { WorkflowRepository } from '../src/models/workflow-repository';
import { AgentResultRepository } from '../src/models/agent-result-repository';
import { TransitionRepository } from '../src/models/transition-repository';

async function main() {
  const prisma = getPrismaClient();
  const workflowRepo = new WorkflowRepository(prisma);
  const agentResultRepo = new AgentResultRepository(prisma);
  const transitionRepo = new TransitionRepository(prisma);

  console.log('🌱 Seeding database...\n');

  // Create workflow
  const workflow = await workflowRepo.createWorkflow({
    userPrompt: 'Implement REST API for user authentication with JWT tokens',
    chainName: 'backend-development',
    complexity: 'moderate',
  });

  console.log(`✅ Created workflow: ${workflow.id}`);
  console.log(`   Prompt: "${workflow.userPrompt}"`);
  console.log(`   Chain: ${workflow.chainName} (${workflow.complexity})\n`);

  // Agent 1: Architect (step 0)
  const architectResult = await agentResultRepo.createResult({
    workflowId: workflow.id,
    agentRole: 'architect',
    complexity: 'moderate',
    stepNumber: 0,
    results: JSON.stringify({
      summary: 'Architecture design completed',
      design: {
        components: ['AuthController', 'JWTService', 'UserRepository'],
        endpoints: [
          'POST /auth/login',
          'POST /auth/register',
          'POST /auth/refresh',
        ],
        security: 'JWT with refresh token rotation',
      },
      recommendations: [
        'Use bcrypt for password hashing',
        'Implement rate limiting on auth endpoints',
        'Store refresh tokens in secure HTTP-only cookies',
      ],
    }),
  });

  console.log(`✅ Created agent result: architect (step ${architectResult.stepNumber})`);

  // Transition: architect → backend-developer
  const transition1 = await transitionRepo.createTransition({
    workflowId: workflow.id,
    fromStep: 0,
    toStep: 1,
    fromAgent: 'architect',
    toAgent: 'backend-developer',
    reason: 'Architecture design approved, proceeding to implementation',
  });

  console.log(`✅ Created transition: step ${transition1.fromStep} → ${transition1.toStep}`);
  console.log(`   ${transition1.fromAgent} → ${transition1.toAgent}\n`);

  // Agent 2: Backend Developer (step 1)
  const backendResult = await agentResultRepo.createResult({
    workflowId: workflow.id,
    agentRole: 'backend-developer',
    complexity: 'moderate',
    stepNumber: 1,
    results: JSON.stringify({
      summary: 'Authentication API implemented',
      files_modified: [
        'src/controllers/auth-controller.ts',
        'src/services/jwt-service.ts',
        'src/repositories/user-repository.ts',
        'src/middleware/auth-middleware.ts',
      ],
      tests_added: [
        'tests/unit/services/jwt-service.test.ts',
        'tests/integration/auth.test.ts',
      ],
      test_coverage: '92%',
    }),
  });

  console.log(`✅ Created agent result: backend-developer (step ${backendResult.stepNumber})`);

  // Transition: backend-developer → reviewer
  const transition2 = await transitionRepo.createTransition({
    workflowId: workflow.id,
    fromStep: 1,
    toStep: 2,
    fromAgent: 'backend-developer',
    toAgent: 'reviewer',
    reason: 'Implementation complete with tests, ready for review',
  });

  console.log(`✅ Created transition: step ${transition2.fromStep} → ${transition2.toStep}`);
  console.log(`   ${transition2.fromAgent} → ${transition2.toAgent}\n`);

  // Agent 3: Reviewer (step 2)
  const reviewerResult = await agentResultRepo.createResult({
    workflowId: workflow.id,
    agentRole: 'reviewer',
    complexity: 'moderate',
    stepNumber: 2,
    results: JSON.stringify({
      summary: 'Code review completed - approved',
      issues_found: [],
      recommendations: [
        'Consider adding OpenAPI documentation for auth endpoints',
        'Add monitoring for failed login attempts',
      ],
      approval_status: 'APPROVED',
    }),
  });

  console.log(`✅ Created agent result: reviewer (step ${reviewerResult.stepNumber})`);

  // Update workflow status to COMPLETED
  await workflowRepo.updateStatus(workflow.id, 'COMPLETED', 2);
  console.log(`✅ Updated workflow status: COMPLETED\n`);

  console.log('🎉 Seeding completed successfully!\n');
  console.log('Summary:');
  console.log('  - 1 workflow created');
  console.log('  - 3 agent results created');
  console.log('  - 2 transitions created');
  console.log('\nView data: pnpm prisma studio');
}

main()
  .then(async () => {
    await disconnectDatabase();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('❌ Seeding failed:', error);
    await disconnectDatabase();
    process.exit(1);
  });
