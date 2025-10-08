/**
 * Unit Tests: Domain Models & Types
 *
 * Tests for workflow domain types, enums, Zod schemas, and type guards.
 * Validates that all type definitions match PRD requirements and provide
 * proper runtime validation.
 */

import { describe, it, expect } from 'vitest';
import {
  ChainName,
  Complexity,
  AgentRole,
  WorkflowStatus,
  ChainNameSchema,
  ComplexitySchema,
  AgentRoleSchema,
  WorkflowStatusSchema,
  IntentSchema,
  WorkflowContextSchema,
  AgentTaskSchema,
  AgentResultDataSchema,
  isChainName,
  isComplexity,
  isAgentRole,
  isWorkflowStatus,
  type Intent,
  type WorkflowContext,
  type AgentTask,
  type AgentResultData,
} from '../../../src/types/workflow';

// ============================================================================
// Enum Value Tests
// ============================================================================

describe('ChainName Enum', () => {
  it('should have all 10 workflow chains from PRD §4.2', () => {
    const expectedChains = [
      'backend-development',
      'frontend-development',
      'debug',
      'review',
      'backend-design-only',
      'frontend-design-only',
      'backend-only',
      'frontend-only',
      'review-only',
      'debug-only',
    ];

    const actualChains = Object.values(ChainName);
    expect(actualChains).toHaveLength(10);
    expectedChains.forEach(chain => {
      expect(actualChains).toContain(chain);
    });
  });

  it('should have correct enum keys', () => {
    expect(ChainName.BACKEND_DEVELOPMENT).toBe('backend-development');
    expect(ChainName.FRONTEND_DEVELOPMENT).toBe('frontend-development');
    expect(ChainName.DEBUG).toBe('debug');
    expect(ChainName.REVIEW).toBe('review');
  });
});

describe('Complexity Enum', () => {
  it('should have exactly 3 complexity levels from PRD §5.2', () => {
    const expectedLevels = ['simple', 'moderate', 'complex'];
    const actualLevels = Object.values(Complexity);

    expect(actualLevels).toHaveLength(3);
    expectedLevels.forEach(level => {
      expect(actualLevels).toContain(level);
    });
  });

  it('should use lowercase values', () => {
    expect(Complexity.SIMPLE).toBe('simple');
    expect(Complexity.MODERATE).toBe('moderate');
    expect(Complexity.COMPLEX).toBe('complex');
  });
});

describe('AgentRole Enum', () => {
  it('should have all 7 agent roles from PRD §3.1', () => {
    const expectedRoles = [
      'backend-architect',
      'frontend-architect',
      'java-backend-developer',
      'nextjs-react-developer',
      'code-reviewer',
      'issue-detective',
      'e2e-test-architect',
    ];

    const actualRoles = Object.values(AgentRole);
    expect(actualRoles).toHaveLength(7);
    expectedRoles.forEach(role => {
      expect(actualRoles).toContain(role);
    });
  });

  it('should use kebab-case values', () => {
    expect(AgentRole.BACKEND_ARCHITECT).toBe('backend-architect');
    expect(AgentRole.FRONTEND_ARCHITECT).toBe('frontend-architect');
    expect(AgentRole.BACKEND_DEVELOPER).toBe('java-backend-developer');
    expect(AgentRole.FRONTEND_DEVELOPER).toBe('nextjs-react-developer');
    expect(AgentRole.E2E_TEST_ARCHITECT).toBe('e2e-test-architect');
  });
});

describe('WorkflowStatus Enum', () => {
  it('should have all 3 workflow statuses', () => {
    const expectedStatuses = ['ACTIVE', 'COMPLETED', 'FAILED'];
    const actualStatuses = Object.values(WorkflowStatus);

    expect(actualStatuses).toHaveLength(3);
    expectedStatuses.forEach(status => {
      expect(actualStatuses).toContain(status);
    });
  });

  it('should use UPPER_CASE values', () => {
    expect(WorkflowStatus.ACTIVE).toBe('ACTIVE');
    expect(WorkflowStatus.COMPLETED).toBe('COMPLETED');
    expect(WorkflowStatus.FAILED).toBe('FAILED');
  });
});

// ============================================================================
// Zod Schema Validation Tests
// ============================================================================

describe('ChainNameSchema', () => {
  it('should accept valid chain names', () => {
    const validChains = [
      'backend-development',
      'frontend-development',
      'debug',
      'review-only',
    ];

    validChains.forEach(chain => {
      expect(() => ChainNameSchema.parse(chain)).not.toThrow();
    });
  });

  it('should reject invalid chain names', () => {
    const invalidChains = ['invalid-chain', 'architect-only', '', 'BACKEND_DEVELOPMENT'];

    invalidChains.forEach(chain => {
      expect(() => ChainNameSchema.parse(chain)).toThrow();
    });
  });

  it('should provide clear error message for invalid values', () => {
    try {
      ChainNameSchema.parse('invalid-chain');
      expect.fail('Should have thrown error');
    } catch (error: any) {
      expect(error.issues[0].message).toContain('Invalid');
      expect(error.issues).toHaveLength(1);
    }
  });
});

describe('ComplexitySchema', () => {
  it('should accept valid complexity levels', () => {
    const validLevels = ['simple', 'moderate', 'complex'];

    validLevels.forEach(level => {
      expect(() => ComplexitySchema.parse(level)).not.toThrow();
    });
  });

  it('should reject invalid complexity levels', () => {
    const invalidLevels = ['SIMPLE', 'easy', 'hard', '', 'medium'];

    invalidLevels.forEach(level => {
      expect(() => ComplexitySchema.parse(level)).toThrow();
    });
  });

  it('should provide clear error message for invalid values', () => {
    try {
      ComplexitySchema.parse('SIMPLE');
      expect.fail('Should have thrown error');
    } catch (error: any) {
      expect(error.issues[0].message).toContain('Invalid');
      expect(error.issues).toHaveLength(1);
    }
  });
});

describe('AgentRoleSchema', () => {
  it('should accept valid agent roles', () => {
    const validRoles = [
      'backend-architect',
      'nextjs-react-developer',
      'code-reviewer',
      'issue-detective',
    ];

    validRoles.forEach(role => {
      expect(() => AgentRoleSchema.parse(role)).not.toThrow();
    });
  });

  it('should reject invalid agent roles', () => {
    const invalidRoles = ['BACKEND_ARCHITECT', 'tester', '', 'developer'];

    invalidRoles.forEach(role => {
      expect(() => AgentRoleSchema.parse(role)).toThrow();
    });
  });

  it('should provide clear error message for invalid values', () => {
    try {
      AgentRoleSchema.parse('invalid-role');
      expect.fail('Should have thrown error');
    } catch (error: any) {
      expect(error.issues[0].message).toContain('Invalid');
      expect(error.issues).toHaveLength(1);
    }
  });
});

describe('WorkflowStatusSchema', () => {
  it('should accept valid workflow statuses', () => {
    const validStatuses = ['ACTIVE', 'COMPLETED', 'FAILED'];

    validStatuses.forEach(status => {
      expect(() => WorkflowStatusSchema.parse(status)).not.toThrow();
    });
  });

  it('should reject invalid workflow statuses', () => {
    const invalidStatuses = ['active', 'pending', 'in_progress', ''];

    invalidStatuses.forEach(status => {
      expect(() => WorkflowStatusSchema.parse(status)).toThrow();
    });
  });
});

describe('IntentSchema', () => {
  it('should accept valid intent with roles and keywords', () => {
    const validIntent = {
      roles: ['backend-architect', 'java-backend-developer'],
      keywords: ['api', 'database', 'rest'],
    };

    const result = IntentSchema.parse(validIntent);
    expect(result.roles).toHaveLength(2);
    expect(result.keywords).toHaveLength(3);
  });

  it('should accept intent without keywords (defaults to empty array)', () => {
    const intentWithoutKeywords = {
      roles: ['code-reviewer'],
    };

    const result = IntentSchema.parse(intentWithoutKeywords);
    expect(result.roles).toHaveLength(1);
    expect(result.keywords).toEqual([]);
  });

  it('should reject intent with empty roles array', () => {
    const invalidIntent = {
      roles: [],
      keywords: ['test'],
    };

    expect(() => IntentSchema.parse(invalidIntent)).toThrow();
  });

  it('should reject intent with invalid role', () => {
    const invalidIntent = {
      roles: ['invalid-role'],
      keywords: [],
    };

    expect(() => IntentSchema.parse(invalidIntent)).toThrow();
  });

  it('should reject intent without roles field', () => {
    const invalidIntent = {
      keywords: ['test'],
    };

    expect(() => IntentSchema.parse(invalidIntent)).toThrow();
  });
});

describe('WorkflowContextSchema', () => {
  it('should accept valid workflow context', () => {
    const validContext = {
      workflowId: '123e4567-e89b-12d3-a456-426614174000',
      userPrompt: 'Implement authentication API',
      chainName: 'backend-development',
      complexity: 'moderate',
      currentStep: 0,
    };

    const result = WorkflowContextSchema.parse(validContext);
    expect(result.workflowId).toBe(validContext.workflowId);
    expect(result.currentStep).toBe(0);
  });

  it('should accept workflow context with previous agent results', () => {
    const contextWithResults = {
      workflowId: '123e4567-e89b-12d3-a456-426614174000',
      userPrompt: 'Implement authentication API',
      chainName: 'backend-development',
      complexity: 'moderate',
      currentStep: 1,
      previousAgentResults: [
        {
          summary: 'Designed authentication system',
          design: 'JWT-based auth with refresh tokens',
          recommendations: ['Use bcrypt for password hashing'],
        },
      ],
    };

    const result = WorkflowContextSchema.parse(contextWithResults);
    expect(result.previousAgentResults).toHaveLength(1);
    expect(result.previousAgentResults![0].summary).toBe('Designed authentication system');
  });

  it('should reject context with invalid UUID', () => {
    const invalidContext = {
      workflowId: 'not-a-uuid',
      userPrompt: 'Test prompt',
      chainName: 'backend-development',
      complexity: 'simple',
      currentStep: 0,
    };

    expect(() => WorkflowContextSchema.parse(invalidContext)).toThrow();
  });

  it('should reject context with empty user prompt', () => {
    const invalidContext = {
      workflowId: '123e4567-e89b-12d3-a456-426614174000',
      userPrompt: '',
      chainName: 'backend-development',
      complexity: 'simple',
      currentStep: 0,
    };

    expect(() => WorkflowContextSchema.parse(invalidContext)).toThrow();
  });

  it('should reject context with negative current step', () => {
    const invalidContext = {
      workflowId: '123e4567-e89b-12d3-a456-426614174000',
      userPrompt: 'Test prompt',
      chainName: 'backend-development',
      complexity: 'simple',
      currentStep: -1,
    };

    expect(() => WorkflowContextSchema.parse(invalidContext)).toThrow();
  });
});

describe('AgentTaskSchema', () => {
  it('should accept valid agent task', () => {
    const validTask = {
      role: 'backend-architect',
      complexity: 'moderate',
      stepNumber: 0,
      instructions: 'Design the authentication system',
      context: {
        workflowId: '123e4567-e89b-12d3-a456-426614174000',
        userPrompt: 'Implement authentication',
        chainName: 'backend-development',
        complexity: 'moderate',
        currentStep: 0,
      },
    };

    const result = AgentTaskSchema.parse(validTask);
    expect(result.role).toBe('backend-architect');
    expect(result.stepNumber).toBe(0);
  });

  it('should reject task with empty instructions', () => {
    const invalidTask = {
      role: 'java-backend-developer',
      complexity: 'simple',
      stepNumber: 1,
      instructions: '',
      context: {
        workflowId: '123e4567-e89b-12d3-a456-426614174000',
        userPrompt: 'Test prompt',
        chainName: 'backend-only',
        complexity: 'simple',
        currentStep: 0,
      },
    };

    expect(() => AgentTaskSchema.parse(invalidTask)).toThrow();
  });

  it('should reject task with negative step number', () => {
    const invalidTask = {
      role: 'code-reviewer',
      complexity: 'simple',
      stepNumber: -1,
      instructions: 'Review the code',
      context: {
        workflowId: '123e4567-e89b-12d3-a456-426614174000',
        userPrompt: 'Review changes',
        chainName: 'review-only',
        complexity: 'simple',
        currentStep: 0,
      },
    };

    expect(() => AgentTaskSchema.parse(invalidTask)).toThrow();
  });
});

describe('AgentResultDataSchema', () => {
  it('should accept valid agent result with all fields', () => {
    const validResult = {
      summary: 'Implemented authentication endpoints',
      design: 'RESTful API with JWT',
      filesModified: ['src/auth/controller.ts', 'src/auth/service.ts'],
      issuesFound: ['Missing input validation'],
      recommendations: ['Add rate limiting', 'Implement 2FA'],
    };

    const result = AgentResultDataSchema.parse(validResult);
    expect(result.summary).toBe('Implemented authentication endpoints');
    expect(result.filesModified).toHaveLength(2);
  });

  it('should accept result with only required summary field', () => {
    const minimalResult = {
      summary: 'Completed task successfully',
    };

    const result = AgentResultDataSchema.parse(minimalResult);
    expect(result.summary).toBe('Completed task successfully');
    expect(result.design).toBeUndefined();
    expect(result.filesModified).toBeUndefined();
  });

  it('should reject result with empty summary', () => {
    const invalidResult = {
      summary: '',
      design: 'Some design',
    };

    expect(() => AgentResultDataSchema.parse(invalidResult)).toThrow();
  });

  it('should reject result without summary', () => {
    const invalidResult = {
      design: 'Some design',
      filesModified: ['file.ts'],
    };

    expect(() => AgentResultDataSchema.parse(invalidResult)).toThrow();
  });
});

// ============================================================================
// Type Guard Tests
// ============================================================================

describe('isChainName Type Guard', () => {
  it('should return true for valid chain names', () => {
    expect(isChainName('backend-development')).toBe(true);
    expect(isChainName('frontend-development')).toBe(true);
    expect(isChainName('debug')).toBe(true);
    expect(isChainName('review-only')).toBe(true);
  });

  it('should return false for invalid chain names', () => {
    expect(isChainName('invalid-chain')).toBe(false);
    expect(isChainName('BACKEND_DEVELOPMENT')).toBe(false);
    expect(isChainName('')).toBe(false);
    expect(isChainName('architect-only')).toBe(false);
  });
});

describe('isComplexity Type Guard', () => {
  it('should return true for valid complexity levels', () => {
    expect(isComplexity('simple')).toBe(true);
    expect(isComplexity('moderate')).toBe(true);
    expect(isComplexity('complex')).toBe(true);
  });

  it('should return false for invalid complexity levels', () => {
    expect(isComplexity('SIMPLE')).toBe(false);
    expect(isComplexity('easy')).toBe(false);
    expect(isComplexity('')).toBe(false);
    expect(isComplexity('medium')).toBe(false);
  });
});

describe('isAgentRole Type Guard', () => {
  it('should return true for valid agent roles', () => {
    expect(isAgentRole('backend-architect')).toBe(true);
    expect(isAgentRole('nextjs-react-developer')).toBe(true);
    expect(isAgentRole('code-reviewer')).toBe(true);
    expect(isAgentRole('issue-detective')).toBe(true);
    expect(isAgentRole('e2e-test-architect')).toBe(true);
  });

  it('should return false for invalid agent roles', () => {
    expect(isAgentRole('BACKEND_ARCHITECT')).toBe(false);
    expect(isAgentRole('developer')).toBe(false);
    expect(isAgentRole('')).toBe(false);
    expect(isAgentRole('tester')).toBe(false);
  });
});

describe('isWorkflowStatus Type Guard', () => {
  it('should return true for valid workflow statuses', () => {
    expect(isWorkflowStatus('ACTIVE')).toBe(true);
    expect(isWorkflowStatus('COMPLETED')).toBe(true);
    expect(isWorkflowStatus('FAILED')).toBe(true);
  });

  it('should return false for invalid workflow statuses', () => {
    expect(isWorkflowStatus('active')).toBe(false);
    expect(isWorkflowStatus('pending')).toBe(false);
    expect(isWorkflowStatus('')).toBe(false);
    expect(isWorkflowStatus('IN_PROGRESS')).toBe(false);
  });
});

// ============================================================================
// Edge Cases and Integration Tests
// ============================================================================

describe('Type System Integration', () => {
  it('should use consistent casing across related types', () => {
    // Chain names use kebab-case
    expect(ChainName.BACKEND_DEVELOPMENT).toMatch(/^[a-z-]+$/);

    // Complexity uses lowercase
    expect(Complexity.MODERATE).toMatch(/^[a-z]+$/);

    // Agent roles use kebab-case
    expect(AgentRole.BACKEND_ARCHITECT).toMatch(/^[a-z-]+$/);

    // Workflow status uses UPPER_CASE
    expect(WorkflowStatus.ACTIVE).toMatch(/^[A-Z_]+$/);
  });

  it('should maintain type safety with enums', () => {
    const testChain: ChainName = ChainName.BACKEND_DEVELOPMENT;
    const testComplexity: Complexity = Complexity.MODERATE;
    const testRole: AgentRole = AgentRole.BACKEND_ARCHITECT;
    const testStatus: WorkflowStatus = WorkflowStatus.ACTIVE;

    expect(testChain).toBe('backend-development');
    expect(testComplexity).toBe('moderate');
    expect(testRole).toBe('backend-architect');
    expect(testStatus).toBe('ACTIVE');
  });

  it('should properly type complex nested structures', () => {
    const context: WorkflowContext = {
      workflowId: '123e4567-e89b-12d3-a456-426614174000',
      userPrompt: 'Test',
      chainName: ChainName.BACKEND_DEVELOPMENT,
      complexity: Complexity.MODERATE,
      currentStep: 0,
      previousAgentResults: [
        {
          summary: 'Done',
          filesModified: ['file.ts'],
        },
      ],
    };

    const task: AgentTask = {
      role: AgentRole.BACKEND_ARCHITECT,
      complexity: Complexity.MODERATE,
      stepNumber: 0,
      instructions: 'Design system',
      context,
    };

    expect(task.context.workflowId).toBe(context.workflowId);
    expect(task.role).toBe(AgentRole.BACKEND_ARCHITECT);
  });
});
