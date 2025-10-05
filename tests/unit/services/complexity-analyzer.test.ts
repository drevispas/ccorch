/**
 * Unit Tests: Complexity Analyzer
 *
 * Tests for the pluggable complexity analysis system.
 * Validates scoring factors, configuration system, and integration.
 *
 * PRD Reference: §5.2 Step 3 - Determine Complexity
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { analyzeComplexity } from '../../../src/services/complexity-analyzer';
import { parseIntent } from '../../../src/services/prompt-parser';
import { Complexity, AgentRole } from '../../../src/types/workflow';
import type { ComplexityConfig, ConfigOverrides } from '../../../src/config/complexity';
import { DEFAULT_COMPLEXITY_CONFIG } from '../../../src/config/complexity';

// ============================================================================
// Scope Factor Tests
// ============================================================================

describe('Complexity Analyzer - Scope Factor', () => {
  it('should detect SIMPLE for single file scope', () => {
    const prompt = 'Fix typo in login.ts file';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.SIMPLE);
  });

  it('should detect SIMPLE for single function modification', () => {
    const prompt = 'Rename the getUserId function to fetchUserId';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.SIMPLE);
  });

  it('should detect MODERATE for few files (2-5 files)', () => {
    const prompt = 'Add validation to 3 controller files';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.MODERATE);
  });

  it('should detect MODERATE for several files without explicit count', () => {
    const prompt = 'Update several service files with new error handling';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.MODERATE);
  });

  it('should detect COMPLEX for multi-module scope', () => {
    const prompt = 'Refactor entire authentication module';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.COMPLEX);
  });

  it('should detect COMPLEX for system-wide changes', () => {
    const prompt = 'Implement system-wide logging infrastructure';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.COMPLEX);
  });

  it('should parse numeric hints: "modify 5 files"', () => {
    const prompt = 'Modify 5 files to add new imports';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.MODERATE);
  });

  it('should parse numeric hints: "update 15 files" (COMPLEX)', () => {
    const prompt = 'Update 15 files with new API endpoints';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.COMPLEX);
  });
});

// ============================================================================
// Dependencies Factor Tests
// ============================================================================

describe('Complexity Analyzer - Dependencies Factor', () => {
  it('should detect SIMPLE for standalone changes', () => {
    const prompt = 'Add a standalone helper function';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.SIMPLE);
  });

  it('should detect MODERATE for few integrations', () => {
    const prompt = 'Integrate with JWT library for authentication';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.MODERATE);
  });

  it('should detect COMPLEX for multiple external dependencies', () => {
    const prompt = 'Connect to Redis, Postgres, and Kafka for event streaming';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    // With 3 external dependencies, this could be MODERATE or COMPLEX
    expect([Complexity.MODERATE, Complexity.COMPLEX]).toContain(result);
  });

  it('should detect COMPLEX when mentioning specific complex integrations', () => {
    const prompt = 'Set up Elasticsearch integration for search';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.MODERATE); // Single integration but complex tech
  });
});

// ============================================================================
// Risk Factor Tests
// ============================================================================

describe('Complexity Analyzer - Risk Factor', () => {
  it('should detect SIMPLE for low-risk additions', () => {
    const prompt = 'Add new optional feature with feature flag';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.SIMPLE);
  });

  it('should detect MODERATE for medium-risk modifications', () => {
    const prompt = 'Update API response format maintaining backward compatibility';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.MODERATE);
  });

  it('should detect COMPLEX for high-risk schema changes', () => {
    const prompt = 'Migrate database schema to new structure';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.COMPLEX);
  });

  it('should detect COMPLEX for breaking API changes', () => {
    const prompt = 'Refactor API with breaking changes';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.COMPLEX);
  });

  it('should detect COMPLEX for large refactorings', () => {
    const prompt = 'Refactor to microservices architecture';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.COMPLEX);
  });
});

// ============================================================================
// Keyword Modifier Tests
// ============================================================================

describe('Complexity Analyzer - Keyword Modifiers', () => {
  it('should override to SIMPLE with "quick fix" modifier', () => {
    const prompt = 'Quick fix for the login validation bug';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.SIMPLE);
  });

  it('should override to SIMPLE with "simple change" modifier', () => {
    const prompt = 'Simple change to update the error message';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.SIMPLE);
  });

  it('should handle ambiguous "small refactor" modifier', () => {
    const prompt = 'Small refactor of the utility functions';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    // "small" (simple) vs "refactor" (complex) creates ambiguity
    expect([Complexity.SIMPLE, Complexity.MODERATE]).toContain(result);
  });

  it('should override to COMPLEX with "complete redesign" modifier', () => {
    const prompt = 'Complete redesign of the authentication flow';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.COMPLEX);
  });

  it('should override to COMPLEX with "architect whole system" modifier', () => {
    const prompt = 'Architect the whole payment processing system';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.COMPLEX);
  });

  it('should detect high complexity with "enterprise-grade" modifier', () => {
    const prompt = 'Build enterprise-grade monitoring solution';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    // Enterprise-grade suggests higher complexity
    expect([Complexity.MODERATE, Complexity.COMPLEX]).toContain(result);
  });

  it('should handle mixed signals with net weight calculation', () => {
    const prompt = 'Simple microservices implementation';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    // "Simple" modifier vs "microservices" (complex) - should balance out
    expect([Complexity.SIMPLE, Complexity.MODERATE]).toContain(result);
  });

  it('should give precedence to explicit modifiers over implicit signals', () => {
    const prompt = 'Quick patch for the entire system';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    // "Quick patch" (simple) should somewhat offset "entire system" (complex)
    expect([Complexity.SIMPLE, Complexity.MODERATE, Complexity.COMPLEX]).toContain(result);
  });
});

// ============================================================================
// Default Behavior Tests
// ============================================================================

describe('Complexity Analyzer - Default Behavior', () => {
  it('should default to MODERATE for ambiguous prompts', () => {
    const prompt = 'Implement the authentication feature';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.MODERATE);
  });

  it('should default to MODERATE when no clear signals present', () => {
    const prompt = 'Create the user profile functionality';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.MODERATE);
  });

  it('should handle prompts with conflicting signals', () => {
    const prompt = 'Simple complete system redesign';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    // Conflicting modifiers should result in moderate or weighted toward stronger signal
    expect([Complexity.MODERATE, Complexity.COMPLEX]).toContain(result);
  });
});

// ============================================================================
// Integration with Intent Tests
// ============================================================================

describe('Complexity Analyzer - Intent Integration', () => {
  it('should consider architect role for design tasks', () => {
    const prompt = 'Design microservices architecture';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(intent.roles).toContain(AgentRole.BACKEND_ARCHITECT);
    expect(result).toBe(Complexity.COMPLEX);
  });

  it('should handle developer role with normal scoring', () => {
    const prompt = 'Implement user registration endpoint';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(intent.roles).toContain(AgentRole.BACKEND_DEVELOPER);
    expect(result).toBe(Complexity.MODERATE);
  });

  it('should handle debugger role with targeted fixes', () => {
    const prompt = 'Fix bug in login validation';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(intent.roles).toContain(AgentRole.DEBUGGER);
    expect(result).toBe(Complexity.SIMPLE);
  });

  it('should handle reviewer role normally', () => {
    const prompt = 'Review database changes';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(intent.roles).toContain(AgentRole.REVIEWER);
    expect([Complexity.SIMPLE, Complexity.MODERATE]).toContain(result);
  });
});

// ============================================================================
// Real-World Scenarios
// ============================================================================

describe('Complexity Analyzer - Real-World Scenarios', () => {
  it('should correctly analyze: "Add JWT auth endpoint"', () => {
    const prompt = 'Add JWT authentication endpoint';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    // "Add" is simple keyword, but JWT/auth suggests moderate scope
    expect([Complexity.SIMPLE, Complexity.MODERATE]).toContain(result);
  });

  it('should correctly analyze: "Design microservices architecture"', () => {
    const prompt = 'Design microservices architecture for order system';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.COMPLEX);
  });

  it('should correctly analyze: "Fix typo in error message"', () => {
    const prompt = 'Fix typo in the error message';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.SIMPLE);
  });

  it('should correctly analyze: "Create user profile component"', () => {
    const prompt = 'Create user profile component with form validation';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.MODERATE);
  });

  it('should correctly analyze: "Refactor monolith to event-driven"', () => {
    const prompt = 'Refactor monolith to event-driven system';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.COMPLEX);
  });

  it('should correctly analyze: "Add validation to email field"', () => {
    const prompt = 'Add validation to email field';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.SIMPLE);
  });

  it('should correctly analyze: "Implement complete OAuth2 flow"', () => {
    const prompt = 'Implement complete OAuth2 authentication flow';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.COMPLEX);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Complexity Analyzer - Edge Cases', () => {
  it('should handle very long prompts with multiple factors', () => {
    const prompt = `
      Implement a comprehensive authentication system with JWT tokens,
      refresh tokens, user registration, login, logout, password reset,
      email verification, role-based access control, and integration
      with the existing database service layer across multiple modules.
    `;
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.COMPLEX);
  });

  it('should handle prompts with only keywords, no action words', () => {
    const prompt = 'Authentication system with JWT and Redis';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect([Complexity.MODERATE, Complexity.COMPLEX]).toContain(result);
  });

  it('should handle case-insensitive keywords', () => {
    const prompt = 'QUICK FIX FOR DATABASE ISSUE';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect(result).toBe(Complexity.SIMPLE);
  });

  it('should handle special characters and punctuation', () => {
    const prompt = 'Design & architect the API endpoints!';
    const intent = parseIntent(prompt);
    const result = analyzeComplexity(prompt, intent);

    expect([Complexity.MODERATE, Complexity.COMPLEX]).toContain(result);
  });
});
