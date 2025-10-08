/**
 * Agent Configuration Validator
 *
 * Purpose: Validates that all required agent configurations exist at startup
 * WBS Task: 6.4 Configuration Validation
 *
 * Note: This validates internal config references, NOT .claude/agents/ filesystem
 * (per Development Plan and CLAUDE.md)
 */

import { AgentRole, Complexity } from '../types/workflow.js';
import { logger } from '../utils/logger.js';

/**
 * Agent configuration entry
 */
export interface AgentConfig {
  role: AgentRole;
  complexity: Complexity;
  agentName: string;
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  valid: boolean;
  totalConfigurations: number;
  roles: AgentRole[];
  complexityLevels: Complexity[];
  configurations: AgentConfig[];
  summary: string;
}

/**
 * Generate all required agent configuration combinations
 *
 * @returns Array of all 21 agent configurations (7 roles × 3 complexity levels)
 */
function generateRequiredConfigurations(): AgentConfig[] {
  const configurations: AgentConfig[] = [];

  for (const role of Object.values(AgentRole)) {
    for (const complexity of Object.values(Complexity)) {
      configurations.push({
        role,
        complexity,
        agentName: `${role}-${complexity}`,
      });
    }
  }

  return configurations;
}

/**
 * Validate that all required agent configurations exist
 *
 * Checks for all combinations of:
 * - 7 agent roles (backend-architect, frontend-architect, java-backend-developer,
 *   nextjs-react-developer, code-reviewer, issue-detective, e2e-test-architect)
 * - 3 complexity levels (simple, moderate, complex)
 * - Total: 21 configurations
 *
 * @throws Error if any required configuration is missing
 * @returns Configuration validation result
 */
export function validateAgentConfig(): ConfigValidationResult {
  const roles = Object.values(AgentRole);
  const complexityLevels = Object.values(Complexity);
  const configurations = generateRequiredConfigurations();

  // Validate counts
  const expectedRoleCount = 7;
  const expectedComplexityCount = 3;
  const expectedTotalCount = expectedRoleCount * expectedComplexityCount;

  if (roles.length !== expectedRoleCount) {
    throw new Error(
      `Invalid agent role count: expected ${expectedRoleCount}, got ${roles.length}`
    );
  }

  if (complexityLevels.length !== expectedComplexityCount) {
    throw new Error(
      `Invalid complexity level count: expected ${expectedComplexityCount}, got ${complexityLevels.length}`
    );
  }

  if (configurations.length !== expectedTotalCount) {
    throw new Error(
      `Invalid configuration count: expected ${expectedTotalCount}, got ${configurations.length}`
    );
  }

  // Validate each role has all complexity levels
  for (const role of roles) {
    for (const complexity of complexityLevels) {
      const config = configurations.find(
        (c) => c.role === role && c.complexity === complexity
      );

      if (!config) {
        throw new Error(
          `Missing agent configuration: ${role}-${complexity}`
        );
      }
    }
  }

  const summary = `Validated ${expectedTotalCount} agent configurations (${expectedRoleCount} roles × ${expectedComplexityCount} complexity levels)`;

  logger.info({ configCount: configurations.length }, summary);

  return {
    valid: true,
    totalConfigurations: configurations.length,
    roles,
    complexityLevels,
    configurations,
    summary,
  };
}
