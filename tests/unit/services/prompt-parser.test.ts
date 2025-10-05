/**
 * Unit Tests: Prompt Parser
 *
 * Tests for user prompt intent parsing and role identification.
 * Validates keyword-based role detection for architect, backend-developer,
 * frontend-developer, reviewer, and debugger roles.
 *
 * PRD Reference: §5.2 Step 1 - Parse User Intent
 */

import { describe, it, expect } from 'vitest';
import { parseIntent } from '../../../src/services/prompt-parser';
import { AgentRole } from '../../../src/types/workflow';

// ============================================================================
// Architect Role Detection Tests
// ============================================================================

describe('Prompt Parser - Architect Role Detection', () => {
  it('should detect backend-architect from "design" keyword with backend context', () => {
    const prompt = 'Design authentication system for REST API';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.BACKEND_ARCHITECT);
    expect(intent.keywords).toContain('design');
    expect(intent.keywords).toContain('api');
  });

  it('should detect backend-architect from "architect" keyword', () => {
    const prompt = 'Architect the database schema for user management';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.BACKEND_ARCHITECT);
    expect(intent.keywords).toContain('architect');
    expect(intent.keywords).toContain('database');
  });

  it('should detect frontend-architect from "design" keyword with frontend context', () => {
    const prompt = 'Design the UI components for user dashboard';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.FRONTEND_ARCHITECT);
    expect(intent.keywords).toContain('design');
    expect(intent.keywords).toContain('ui');
    expect(intent.keywords).toContain('component');
  });

  it('should detect frontend-architect from "architect" keyword with frontend context', () => {
    const prompt = 'Architect the React component structure';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.FRONTEND_ARCHITECT);
    expect(intent.keywords).toContain('architect');
    expect(intent.keywords).toContain('react');
    expect(intent.keywords).toContain('component');
  });
});

// ============================================================================
// Developer Role Detection Tests
// ============================================================================

describe('Prompt Parser - Developer Role Detection', () => {
  it('should detect backend-developer from "implement" with backend keywords', () => {
    const prompt = 'Implement REST API endpoints for authentication';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.BACKEND_DEVELOPER);
    expect(intent.keywords).toContain('implement');
    expect(intent.keywords).toContain('rest');
    expect(intent.keywords).toContain('api');
    expect(intent.keywords).toContain('endpoint');
  });

  it('should detect backend-developer from "build" with backend keywords', () => {
    const prompt = 'Build database service layer with repository pattern';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.BACKEND_DEVELOPER);
    expect(intent.keywords).toContain('build');
    expect(intent.keywords).toContain('database');
    expect(intent.keywords).toContain('service');
    expect(intent.keywords).toContain('repository');
  });

  it('should detect backend-developer from "create" with backend keywords', () => {
    const prompt = 'Create controller for user management with Java';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.BACKEND_DEVELOPER);
    expect(intent.keywords).toContain('create');
    expect(intent.keywords).toContain('controller');
    expect(intent.keywords).toContain('java');
  });

  it('should detect frontend-developer from "implement" with frontend keywords', () => {
    const prompt = 'Implement button component with React';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.FRONTEND_DEVELOPER);
    expect(intent.keywords).toContain('implement');
    expect(intent.keywords).toContain('button');
    expect(intent.keywords).toContain('component');
    expect(intent.keywords).toContain('react');
  });

  it('should detect frontend-developer from "build" with frontend keywords', () => {
    const prompt = 'Build user profile page with CSS styling';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.FRONTEND_DEVELOPER);
    expect(intent.keywords).toContain('build');
    expect(intent.keywords).toContain('page');
    expect(intent.keywords).toContain('css');
  });

  it('should detect frontend-developer from "add" with frontend keywords', () => {
    const prompt = 'Add HTML form component to the home page';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.FRONTEND_DEVELOPER);
    expect(intent.keywords).toContain('add');
    expect(intent.keywords).toContain('html');
    expect(intent.keywords).toContain('component');
    expect(intent.keywords).toContain('home');
    expect(intent.keywords).toContain('page');
  });

  it('should default to backend-developer when no frontend/backend keywords present', () => {
    const prompt = 'Implement the new feature';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.BACKEND_DEVELOPER);
    expect(intent.keywords).toContain('implement');
  });
});

// ============================================================================
// Reviewer Role Detection Tests
// ============================================================================

describe('Prompt Parser - Reviewer Role Detection', () => {
  it('should detect reviewer from "review" keyword', () => {
    const prompt = 'Review my changes';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.REVIEWER);
    expect(intent.keywords).toContain('review');
  });

  it('should detect reviewer from "review" with specific context', () => {
    const prompt = 'Review the authentication implementation';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.REVIEWER);
    expect(intent.keywords).toContain('review');
  });

  it('should detect reviewer from "code review" phrase', () => {
    const prompt = 'Perform code review on the new API endpoints';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.REVIEWER);
    expect(intent.keywords).toContain('review');
    expect(intent.keywords).toContain('api');
    expect(intent.keywords).toContain('endpoint');
  });
});

// ============================================================================
// Debugger Role Detection Tests
// ============================================================================

describe('Prompt Parser - Debugger Role Detection', () => {
  it('should detect debugger from "debug" keyword', () => {
    const prompt = 'Debug the login functionality';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.DEBUGGER);
    expect(intent.keywords).toContain('debug');
  });

  it('should detect debugger from "fix" keyword', () => {
    const prompt = 'Fix the bug in authentication';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.DEBUGGER);
    expect(intent.keywords).toContain('fix');
    expect(intent.keywords).toContain('bug');
  });

  it('should detect debugger from "resolve" keyword', () => {
    const prompt = 'Resolve the error in the API endpoint';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.DEBUGGER);
    expect(intent.keywords).toContain('resolve');
    expect(intent.keywords).toContain('error');
    expect(intent.keywords).toContain('api');
    expect(intent.keywords).toContain('endpoint');
  });

  it('should detect debugger from "troubleshoot" keyword', () => {
    const prompt = 'Troubleshoot the database connection issue';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.DEBUGGER);
    expect(intent.keywords).toContain('troubleshoot');
    expect(intent.keywords).toContain('database');
  });
});

// ============================================================================
// Multi-Role Detection Tests
// ============================================================================

describe('Prompt Parser - Multi-Role Detection', () => {
  it('should detect both architect and developer roles', () => {
    const prompt = 'Design and implement the authentication system';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.BACKEND_ARCHITECT);
    expect(intent.roles).toContain(AgentRole.BACKEND_DEVELOPER);
    expect(intent.keywords).toContain('design');
    expect(intent.keywords).toContain('implement');
  });

  it('should detect both debugger and developer roles', () => {
    const prompt = 'Fix the bug and implement the solution';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.DEBUGGER);
    expect(intent.roles).toContain(AgentRole.BACKEND_DEVELOPER);
    expect(intent.keywords).toContain('fix');
    expect(intent.keywords).toContain('implement');
  });

  it('should detect both reviewer and developer roles', () => {
    const prompt = 'Review and improve the API implementation';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.REVIEWER);
    expect(intent.roles).toContain(AgentRole.BACKEND_DEVELOPER);
    expect(intent.keywords).toContain('review');
    expect(intent.keywords).toContain('api');
  });
});

// ============================================================================
// Backend vs Frontend Keyword Detection Tests
// ============================================================================

describe('Prompt Parser - Backend vs Frontend Keyword Detection', () => {
  it('should detect backend keywords: java, api, database, controller, service', () => {
    const prompt = 'Build Java controller with database service layer and REST API';
    const intent = parseIntent(prompt);

    expect(intent.keywords).toContain('java');
    expect(intent.keywords).toContain('controller');
    expect(intent.keywords).toContain('database');
    expect(intent.keywords).toContain('service');
    expect(intent.keywords).toContain('rest');
    expect(intent.keywords).toContain('api');
  });

  it('should detect backend keywords: repository, junit, endpoint, sql', () => {
    const prompt = 'Create repository with JUnit tests for SQL endpoint';
    const intent = parseIntent(prompt);

    expect(intent.keywords).toContain('repository');
    expect(intent.keywords).toContain('junit');
    expect(intent.keywords).toContain('endpoint');
    expect(intent.keywords).toContain('sql');
  });

  it('should detect frontend keywords: ui, ux, component, page, react', () => {
    const prompt = 'Build React component for user page with good UX and UI';
    const intent = parseIntent(prompt);

    expect(intent.keywords).toContain('react');
    expect(intent.keywords).toContain('component');
    expect(intent.keywords).toContain('page');
    expect(intent.keywords).toContain('ux');
    expect(intent.keywords).toContain('ui');
  });

  it('should detect frontend keywords: vue, css, html, button, web', () => {
    const prompt = 'Create Vue web component with HTML button and CSS styling';
    const intent = parseIntent(prompt);

    expect(intent.keywords).toContain('vue');
    expect(intent.keywords).toContain('web');
    expect(intent.keywords).toContain('component');
    expect(intent.keywords).toContain('html');
    expect(intent.keywords).toContain('button');
    expect(intent.keywords).toContain('css');
  });

  it('should detect frontend keyword: home', () => {
    const prompt = 'Update the home page layout';
    const intent = parseIntent(prompt);

    expect(intent.keywords).toContain('home');
    expect(intent.keywords).toContain('page');
  });

  it('should detect frontend keyword: typescript (case insensitive)', () => {
    const prompt = 'Add TypeScript types to the component';
    const intent = parseIntent(prompt);

    expect(intent.keywords).toContain('typescript');
    expect(intent.keywords).toContain('component');
  });
});

// ============================================================================
// Edge Cases and Error Handling Tests
// ============================================================================

describe('Prompt Parser - Edge Cases', () => {
  it('should throw error for empty prompt', () => {
    expect(() => parseIntent('')).toThrow();
  });

  it('should throw error for whitespace-only prompt', () => {
    expect(() => parseIntent('   ')).toThrow();
  });

  it('should handle prompts with no clear action words', () => {
    const prompt = 'Authentication system with JWT';
    const intent = parseIntent(prompt);

    // Should still extract keywords even without action words
    expect(intent.keywords).toContain('jwt');
    expect(intent.roles.length).toBeGreaterThan(0);
  });

  it('should handle case-insensitive keyword matching', () => {
    const prompt = 'IMPLEMENT REST API WITH DATABASE';
    const intent = parseIntent(prompt);

    expect(intent.keywords).toContain('implement');
    expect(intent.keywords).toContain('rest');
    expect(intent.keywords).toContain('api');
    expect(intent.keywords).toContain('database');
  });

  it('should handle special characters and punctuation', () => {
    const prompt = 'Design & implement the API endpoints!';
    const intent = parseIntent(prompt);

    expect(intent.keywords).toContain('design');
    expect(intent.keywords).toContain('implement');
    expect(intent.keywords).toContain('api');
    expect(intent.keywords).toContain('endpoint');
  });

  it('should handle very long prompts', () => {
    const prompt = `
      I need to design and implement a comprehensive authentication system
      with JWT tokens, refresh tokens, user registration, login, logout,
      password reset, email verification, role-based access control,
      and integration with the existing database service layer.
    `;
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.BACKEND_ARCHITECT);
    expect(intent.roles).toContain(AgentRole.BACKEND_DEVELOPER);
    expect(intent.keywords).toContain('design');
    expect(intent.keywords).toContain('implement');
    expect(intent.keywords).toContain('jwt');
    expect(intent.keywords).toContain('database');
    expect(intent.keywords).toContain('service');
  });

  it('should deduplicate keywords', () => {
    const prompt = 'Implement API endpoint for API testing';
    const intent = parseIntent(prompt);

    // Count occurrences of 'api'
    const apiCount = intent.keywords.filter(k => k === 'api').length;
    expect(apiCount).toBe(1);
  });

  it('should handle mixed backend and frontend keywords by preferring stronger signals', () => {
    const prompt = 'Build TypeScript API with React admin UI';
    const intent = parseIntent(prompt);

    // Should detect both backend and frontend based on keywords
    expect(intent.keywords).toContain('typescript');
    expect(intent.keywords).toContain('api');
    expect(intent.keywords).toContain('react');
    expect(intent.keywords).toContain('ui');
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Prompt Parser - Real-World Scenarios', () => {
  it('should correctly parse: "Implement REST API for user authentication"', () => {
    const prompt = 'Implement REST API for user authentication';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.BACKEND_DEVELOPER);
    expect(intent.keywords).toContain('implement');
    expect(intent.keywords).toContain('rest');
    expect(intent.keywords).toContain('api');
  });

  it('should correctly parse: "Design microservices architecture"', () => {
    const prompt = 'Design microservices architecture';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.BACKEND_ARCHITECT);
    expect(intent.keywords).toContain('design');
  });

  it('should correctly parse: "Fix the login bug in the frontend"', () => {
    const prompt = 'Fix the login bug in the frontend';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.DEBUGGER);
    expect(intent.keywords).toContain('fix');
    expect(intent.keywords).toContain('bug');
  });

  it('should correctly parse: "Review my database changes"', () => {
    const prompt = 'Review my database changes';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.REVIEWER);
    expect(intent.keywords).toContain('review');
    expect(intent.keywords).toContain('database');
  });

  it('should correctly parse: "Add button component to user profile page"', () => {
    const prompt = 'Add button component to user profile page';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.FRONTEND_DEVELOPER);
    expect(intent.keywords).toContain('add');
    expect(intent.keywords).toContain('button');
    expect(intent.keywords).toContain('component');
    expect(intent.keywords).toContain('page');
  });

  it('should correctly parse: "Create Java service with JUnit tests"', () => {
    const prompt = 'Create Java service with JUnit tests';
    const intent = parseIntent(prompt);

    expect(intent.roles).toContain(AgentRole.BACKEND_DEVELOPER);
    expect(intent.keywords).toContain('create');
    expect(intent.keywords).toContain('java');
    expect(intent.keywords).toContain('service');
    expect(intent.keywords).toContain('junit');
  });
});
