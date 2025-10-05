/**
 * Unit Tests: Chain Resolver
 *
 * Tests for workflow chain determination based on parsed intent.
 * Maps user intent to one of 10 workflow chains (PRD §4.2).
 *
 * PRD Reference: §4.2 Workflow Chains, §5.2 Step 2 - Resolve Chain
 */

import { describe, it, expect } from 'vitest';
import { resolveChain } from '../../../src/services/chain-resolver';
import { parseIntent } from '../../../src/services/prompt-parser';
import { ChainName, AgentRole } from '../../../src/types/workflow';

// ============================================================================
// Backend Development Chain Tests
// ============================================================================

describe('Chain Resolver - Backend Development Chain', () => {
  it('should resolve backend-development for "Implement backend API"', () => {
    const prompt = 'Implement backend API for user authentication';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.BACKEND_DEVELOPMENT);
    expect(result.agentSequence).toEqual([
      AgentRole.BACKEND_ARCHITECT,
      AgentRole.BACKEND_DEVELOPER,
      AgentRole.REVIEWER,
    ]);
  });

  it('should resolve backend-development for Java implementation task', () => {
    const prompt = 'Create REST controller in Java';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.BACKEND_DEVELOPMENT);
    expect(result.agentSequence).toEqual([
      AgentRole.BACKEND_ARCHITECT,
      AgentRole.BACKEND_DEVELOPER,
      AgentRole.REVIEWER,
    ]);
  });

  it('should resolve backend-development for database implementation', () => {
    const prompt = 'Implement database models for order system';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.BACKEND_DEVELOPMENT);
    expect(result.agentSequence).toEqual([
      AgentRole.BACKEND_ARCHITECT,
      AgentRole.BACKEND_DEVELOPER,
      AgentRole.REVIEWER,
    ]);
  });

  it('should resolve backend-development for service layer implementation', () => {
    const prompt = 'Build service layer for payment processing';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.BACKEND_DEVELOPMENT);
  });
});

// ============================================================================
// Frontend Development Chain Tests
// ============================================================================

describe('Chain Resolver - Frontend Development Chain', () => {
  it('should resolve frontend-development for "Build React component"', () => {
    const prompt = 'Build React component for user profile';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.FRONTEND_DEVELOPMENT);
    expect(result.agentSequence).toEqual([
      AgentRole.FRONTEND_ARCHITECT,
      AgentRole.FRONTEND_DEVELOPER,
      AgentRole.REVIEWER,
    ]);
  });

  it('should resolve frontend-development for UI implementation', () => {
    const prompt = 'Create UI for dashboard page';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.FRONTEND_DEVELOPMENT);
    expect(result.agentSequence).toEqual([
      AgentRole.FRONTEND_ARCHITECT,
      AgentRole.FRONTEND_DEVELOPER,
      AgentRole.REVIEWER,
    ]);
  });

  it('should resolve frontend-development for component with button', () => {
    const prompt = 'Implement submit button component';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.FRONTEND_DEVELOPMENT);
  });

  it('should resolve frontend-development for Vue component', () => {
    const prompt = 'Build Vue component for navigation';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.FRONTEND_DEVELOPMENT);
  });
});

// ============================================================================
// Debug Chain Tests
// ============================================================================

describe('Chain Resolver - Debug Chain', () => {
  it('should resolve debug for "Debug API error"', () => {
    const prompt = 'Debug API error in login endpoint';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.DEBUG);
    expect(result.agentSequence).toEqual([
      AgentRole.DEBUGGER,
      AgentRole.BACKEND_DEVELOPER,
      AgentRole.REVIEWER,
    ]);
  });

  it('should resolve debug for fix task', () => {
    const prompt = 'Fix bug in user validation';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.DEBUG);
  });

  it('should resolve debug for troubleshoot task', () => {
    const prompt = 'Troubleshoot memory leak in service';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.DEBUG);
  });

  it('should resolve debug with frontend developer for UI bug', () => {
    const prompt = 'Fix React component rendering issue';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.DEBUG);
    expect(result.agentSequence).toEqual([
      AgentRole.DEBUGGER,
      AgentRole.FRONTEND_DEVELOPER,
      AgentRole.REVIEWER,
    ]);
  });
});

// ============================================================================
// Review Chain Tests
// ============================================================================

describe('Chain Resolver - Review Chain', () => {
  it('should resolve review for "Review my code"', () => {
    const prompt = 'Review my code for authentication';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.REVIEW);
    expect(result.agentSequence).toEqual([
      AgentRole.REVIEWER,
      AgentRole.BACKEND_DEVELOPER,
    ]);
  });

  it('should resolve review for code review task', () => {
    const prompt = 'Code review for payment processing';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.REVIEW);
  });

  it('should resolve review with frontend developer for UI review', () => {
    const prompt = 'Review React component code';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.REVIEW);
    expect(result.agentSequence).toEqual([
      AgentRole.REVIEWER,
      AgentRole.FRONTEND_DEVELOPER,
    ]);
  });
});

// ============================================================================
// Design-Only Chain Tests
// ============================================================================

describe('Chain Resolver - Design-Only Chains', () => {
  it('should resolve backend-design-only for "Design backend system"', () => {
    const prompt = 'Design backend system for order management';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.BACKEND_DESIGN_ONLY);
    expect(result.agentSequence).toEqual([AgentRole.BACKEND_ARCHITECT]);
  });

  it('should resolve frontend-design-only for "Design frontend UI"', () => {
    const prompt = 'Design frontend UI for dashboard';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.FRONTEND_DESIGN_ONLY);
    expect(result.agentSequence).toEqual([AgentRole.FRONTEND_ARCHITECT]);
  });

  it('should resolve backend-design-only for API architecture design', () => {
    const prompt = 'Design API architecture for microservices';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.BACKEND_DESIGN_ONLY);
  });

  it('should resolve frontend-design-only for UX design', () => {
    const prompt = 'Design UX flow for checkout process';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.FRONTEND_DESIGN_ONLY);
  });
});

// ============================================================================
// Implementation-Only Chain Tests
// ============================================================================

describe('Chain Resolver - Implementation-Only Chains', () => {
  it('should resolve backend-only for backend implementation without design', () => {
    const prompt = 'Add new endpoint to existing controller';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.BACKEND_ONLY);
    expect(result.agentSequence).toEqual([AgentRole.BACKEND_DEVELOPER]);
  });

  it('should resolve frontend-only for frontend implementation without design', () => {
    const prompt = 'Add button to existing component';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.FRONTEND_ONLY);
    expect(result.agentSequence).toEqual([AgentRole.FRONTEND_DEVELOPER]);
  });
});

// ============================================================================
// Single-Agent Chain Tests
// ============================================================================

describe('Chain Resolver - Single-Agent Chains', () => {
  it('should resolve review-only for review without fixes', () => {
    const prompt = 'Just review the code, no changes needed';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.REVIEW_ONLY);
    expect(result.agentSequence).toEqual([AgentRole.REVIEWER]);
  });

  it('should resolve debug-only for investigation without fixes', () => {
    const prompt = 'Investigate the performance issue';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.DEBUG_ONLY);
    expect(result.agentSequence).toEqual([AgentRole.DEBUGGER]);
  });
});

// ============================================================================
// Backend vs Frontend Selection Tests
// ============================================================================

describe('Chain Resolver - Backend vs Frontend Selection', () => {
  it('should select backend for Java keyword', () => {
    const prompt = 'Implement feature using Java Spring';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.BACKEND_DEVELOPMENT);
  });

  it('should select backend for API keyword', () => {
    const prompt = 'Create REST API endpoints';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.BACKEND_DEVELOPMENT);
  });

  it('should select backend for database keyword', () => {
    const prompt = 'Implement database schema';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.BACKEND_DEVELOPMENT);
  });

  it('should select backend for controller keyword', () => {
    const prompt = 'Build controller for orders';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.BACKEND_DEVELOPMENT);
  });

  it('should select backend for service keyword', () => {
    const prompt = 'Create service layer';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.BACKEND_DEVELOPMENT);
  });

  it('should select frontend for UI keyword', () => {
    const prompt = 'Implement UI for settings page';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.FRONTEND_DEVELOPMENT);
  });

  it('should select frontend for UX keyword', () => {
    const prompt = 'Build UX for user registration';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.FRONTEND_DEVELOPMENT);
  });

  it('should select frontend for component keyword', () => {
    const prompt = 'Create component library';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.FRONTEND_DEVELOPMENT);
  });

  it('should select frontend for React keyword', () => {
    const prompt = 'Build React application';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.FRONTEND_DEVELOPMENT);
  });

  it('should default to backend when ambiguous', () => {
    const prompt = 'Implement the feature';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.BACKEND_DEVELOPMENT);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Chain Resolver - Edge Cases', () => {
  it('should handle mixed backend and frontend keywords by precedence', () => {
    const prompt = 'Implement API and React UI';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    // Should detect both architect roles, but resolve to full-stack or pick dominant
    expect([
      ChainName.BACKEND_DEVELOPMENT,
      ChainName.FRONTEND_DEVELOPMENT,
    ]).toContain(result.chainName);
  });

  it('should prioritize specific role keywords over domain keywords', () => {
    const prompt = 'Debug React component issue';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    // Debug role should take precedence
    expect(result.chainName).toBe(ChainName.DEBUG);
  });

  it('should handle case-insensitive keywords', () => {
    const prompt = 'IMPLEMENT BACKEND API';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.BACKEND_DEVELOPMENT);
  });

  it('should handle prompts with only architect role detected', () => {
    const prompt = 'Design microservices architecture';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.BACKEND_DESIGN_ONLY);
  });

  it('should handle prompts with only developer role detected', () => {
    const prompt = 'Add new database field';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.BACKEND_ONLY);
  });
});

// ============================================================================
// Real-World Scenarios
// ============================================================================

describe('Chain Resolver - Real-World Scenarios', () => {
  it('should correctly resolve: "Implement JWT authentication"', () => {
    const prompt = 'Implement JWT authentication for the API';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.BACKEND_DEVELOPMENT);
    expect(result.agentSequence.length).toBe(3);
  });

  it('should correctly resolve: "Fix login button not working"', () => {
    const prompt = 'Fix login button not working';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.DEBUG);
  });

  it('should correctly resolve: "Review payment processing code"', () => {
    const prompt = 'Review payment processing code';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.REVIEW);
  });

  it('should correctly resolve: "Design order management system"', () => {
    const prompt = 'Design order management system';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.BACKEND_DESIGN_ONLY);
  });

  it('should correctly resolve: "Build user profile page in React"', () => {
    const prompt = 'Build user profile page in React';
    const intent = parseIntent(prompt);
    const result = resolveChain(intent, prompt);

    expect(result.chainName).toBe(ChainName.FRONTEND_DEVELOPMENT);
  });
});
