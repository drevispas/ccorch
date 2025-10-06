/**
 * Configuration Validator Tests
 *
 * Purpose: Test validation of agent configuration completeness
 * WBS Task: 6.4 Configuration Validation
 */

import { describe, it, expect } from 'vitest';
import { validateAgentConfig } from '../../../src/config/validator';
import { AgentRole, Complexity } from '../../../src/types/workflow';

describe('validateAgentConfig', () => {
  it('should pass when all 21 agent configurations are present', () => {
    // All combinations of 7 roles × 3 complexity levels = 21 configurations
    expect(() => validateAgentConfig()).not.toThrow();
  });

  it('should validate all agent roles are configured', () => {
    // The validator should check for:
    // - BACKEND_ARCHITECT
    // - FRONTEND_ARCHITECT
    // - BACKEND_DEVELOPER
    // - FRONTEND_DEVELOPER
    // - REVIEWER
    // - DEBUGGER
    // - E2E_TEST_ARCHITECT
    const roles = Object.values(AgentRole);
    expect(roles).toHaveLength(7);

    // Validation should ensure all roles are present
    expect(() => validateAgentConfig()).not.toThrow();
  });

  it('should validate all complexity levels are configured', () => {
    // The validator should check for:
    // - SIMPLE
    // - MODERATE
    // - COMPLEX
    const complexities = Object.values(Complexity);
    expect(complexities).toHaveLength(3);

    // Validation should ensure all complexity levels are present
    expect(() => validateAgentConfig()).not.toThrow();
  });

  it('should return configuration details on success', () => {
    const result = validateAgentConfig();

    expect(result).toBeDefined();
    expect(result.totalConfigurations).toBe(21);
    expect(result.roles).toHaveLength(7);
    expect(result.complexityLevels).toHaveLength(3);
    expect(result.valid).toBe(true);
  });

  it('should list all valid agent-complexity combinations', () => {
    const result = validateAgentConfig();

    expect(result.configurations).toHaveLength(21);

    // Spot check: backend-architect should have all 3 complexity levels
    const backendArchitectConfigs = result.configurations.filter(
      (c: { role: string }) => c.role === AgentRole.BACKEND_ARCHITECT
    );
    expect(backendArchitectConfigs).toHaveLength(3);

    // Spot check: reviewer-simple should exist
    const reviewerSimple = result.configurations.find(
      (c: { role: string; complexity: string }) =>
        c.role === AgentRole.REVIEWER && c.complexity === Complexity.SIMPLE
    );
    expect(reviewerSimple).toBeDefined();
  });

  it('should validate configuration structure', () => {
    const result = validateAgentConfig();

    // Each configuration should have role and complexity
    result.configurations.forEach((config: { role: string; complexity: string; agentName: string }) => {
      expect(config.role).toBeDefined();
      expect(config.complexity).toBeDefined();
      expect(config.agentName).toBeDefined();

      // Validate role is a valid AgentRole
      expect(Object.values(AgentRole)).toContain(config.role);

      // Validate complexity is a valid Complexity
      expect(Object.values(Complexity)).toContain(config.complexity);

      // Agent name should follow pattern: {role}-{complexity}
      expect(config.agentName).toBe(`${config.role}-${config.complexity}`);
    });
  });

  it('should include all required agent roles', () => {
    const result = validateAgentConfig();

    const expectedRoles = [
      AgentRole.BACKEND_ARCHITECT,
      AgentRole.FRONTEND_ARCHITECT,
      AgentRole.BACKEND_DEVELOPER,
      AgentRole.FRONTEND_DEVELOPER,
      AgentRole.REVIEWER,
      AgentRole.DEBUGGER,
      AgentRole.E2E_TEST_ARCHITECT,
    ];

    expect(result.roles).toEqual(expect.arrayContaining(expectedRoles));
    expect(result.roles).toHaveLength(expectedRoles.length);
  });

  it('should include all required complexity levels', () => {
    const result = validateAgentConfig();

    const expectedComplexities = [
      Complexity.SIMPLE,
      Complexity.MODERATE,
      Complexity.COMPLEX,
    ];

    expect(result.complexityLevels).toEqual(expect.arrayContaining(expectedComplexities));
    expect(result.complexityLevels).toHaveLength(expectedComplexities.length);
  });

  it('should validate that each role has all complexity levels', () => {
    const result = validateAgentConfig();

    Object.values(AgentRole).forEach((role) => {
      Object.values(Complexity).forEach((complexity) => {
        const config = result.configurations.find(
          (c: { role: string; complexity: string }) =>
            c.role === role && c.complexity === complexity
        );
        expect(config).toBeDefined();
      });
    });
  });

  it('should provide meaningful validation summary', () => {
    const result = validateAgentConfig();

    expect(result.summary).toBeDefined();
    expect(result.summary).toContain('21');
    expect(result.summary).toContain('7');
    expect(result.summary).toContain('3');
  });
});
