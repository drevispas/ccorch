/**
 * Prompt Parser Service
 *
 * Purpose: Parse user prompts to extract intent (roles and keywords)
 * for workflow chain determination and complexity analysis.
 *
 * PRD Reference: §5.2 Step 1 - Parse User Intent
 */

import { AgentRole, type Intent } from '../types/workflow';

// ============================================================================
// Keyword Dictionaries
// ============================================================================

/**
 * Action keywords that indicate architect role (design, no implementation)
 */
const ARCHITECT_KEYWORDS = ['design', 'architect', 'architecture'];

/**
 * Action keywords that indicate developer role (implementation)
 */
const DEVELOPER_KEYWORDS = ['implement', 'build', 'create', 'add', 'write', 'code', 'develop', 'improve', 'update'];

/**
 * Action keywords that indicate reviewer role
 */
const REVIEWER_KEYWORDS = ['review', 'check', 'examine', 'inspect'];

/**
 * Action keywords that indicate debugger role
 */
const DEBUGGER_KEYWORDS = ['debug', 'fix', 'resolve', 'troubleshoot', 'bug', 'error', 'issue'];

/**
 * Backend technology and domain keywords (PRD §4.2)
 */
const BACKEND_KEYWORDS = [
  'java',
  'api',
  'database',
  'controller',
  'service',
  'repository',
  'junit',
  'rest',
  'endpoint',
  'sql',
  'backend',
  'server',
  'jwt',
  'auth',
  'authentication',
];

/**
 * Frontend technology and domain keywords (PRD §4.2)
 */
const FRONTEND_KEYWORDS = [
  'ui',
  'ux',
  'component',
  'home',
  'page',
  'typescript',
  'web',
  'react',
  'vue',
  'css',
  'html',
  'button',
  'frontend',
  'client',
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize and tokenize a prompt into lowercase words
 */
function tokenize(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
    .split(/\s+/)
    .filter(word => word.length > 0);
}

/**
 * Simple stemming function to handle common plural forms
 * Returns the singular form of a word if it ends with 's'
 */
function simpleStem(word: string): string {
  // Handle common plural endings
  if (word.endsWith('s') && word.length > 2) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Extract all matching keywords from tokens
 * Handles both exact matches and simple plural forms
 */
function extractKeywords(tokens: string[], keywordLists: string[][]): string[] {
  const allKeywords = keywordLists.flat();
  const found = new Set<string>();

  for (const token of tokens) {
    // Check exact match
    if (allKeywords.includes(token)) {
      found.add(token);
    } else {
      // Check if stemmed version matches
      const stemmed = simpleStem(token);
      if (allKeywords.includes(stemmed)) {
        found.add(stemmed);
      }
    }
  }

  return Array.from(found);
}

/**
 * Check if any keyword from a list is present in the tokens
 * Handles both exact matches and simple plural forms
 */
function hasKeyword(tokens: string[], keywords: string[]): boolean {
  return tokens.some(token => {
    return keywords.includes(token) || keywords.includes(simpleStem(token));
  });
}

/**
 * Determine if the prompt has backend context
 */
function hasBackendContext(tokens: string[]): boolean {
  return hasKeyword(tokens, BACKEND_KEYWORDS);
}

/**
 * Determine if the prompt has frontend context
 */
function hasFrontendContext(tokens: string[]): boolean {
  return hasKeyword(tokens, FRONTEND_KEYWORDS);
}

/**
 * Determine whether to use backend or frontend architect/developer
 * Based on keyword presence
 */
function determineBackendVsFrontend(tokens: string[]): 'backend' | 'frontend' {
  const hasBackend = hasBackendContext(tokens);
  const hasFrontend = hasFrontendContext(tokens);

  if (hasFrontend && !hasBackend) {
    return 'frontend';
  }

  // Default to backend if ambiguous or no clear signals (PRD §4.2)
  return 'backend';
}

// ============================================================================
// Main Parser Function
// ============================================================================

/**
 * Parse user prompt to extract intent
 *
 * @param prompt - User's task description
 * @returns Intent object containing identified roles and extracted keywords
 * @throws Error if prompt is empty or whitespace-only
 *
 * @example
 * ```typescript
 * const intent = parseIntent('Implement REST API for authentication');
 * // Returns: {
 * //   roles: [AgentRole.BACKEND_DEVELOPER],
 * //   keywords: ['implement', 'rest', 'api']
 * // }
 * ```
 */
export function parseIntent(prompt: string): Intent {
  // Validate input
  const trimmed = prompt.trim();
  if (trimmed.length === 0) {
    throw new Error('Prompt cannot be empty');
  }

  // Tokenize prompt
  const tokens = tokenize(trimmed);

  // Extract all keywords
  const keywords = extractKeywords(tokens, [
    ARCHITECT_KEYWORDS,
    DEVELOPER_KEYWORDS,
    REVIEWER_KEYWORDS,
    DEBUGGER_KEYWORDS,
    BACKEND_KEYWORDS,
    FRONTEND_KEYWORDS,
  ]);

  // Identify roles based on action keywords
  const roles: AgentRole[] = [];

  // Check for architect role
  if (hasKeyword(tokens, ARCHITECT_KEYWORDS)) {
    const domain = determineBackendVsFrontend(tokens);
    roles.push(
      domain === 'backend'
        ? AgentRole.BACKEND_ARCHITECT
        : AgentRole.FRONTEND_ARCHITECT
    );
  }

  // Check for developer role
  if (hasKeyword(tokens, DEVELOPER_KEYWORDS)) {
    const domain = determineBackendVsFrontend(tokens);
    roles.push(
      domain === 'backend'
        ? AgentRole.BACKEND_DEVELOPER
        : AgentRole.FRONTEND_DEVELOPER
    );
  }

  // Check for reviewer role
  if (hasKeyword(tokens, REVIEWER_KEYWORDS)) {
    roles.push(AgentRole.REVIEWER);
  }

  // Check for debugger role
  if (hasKeyword(tokens, DEBUGGER_KEYWORDS)) {
    roles.push(AgentRole.DEBUGGER);
  }

  // If no specific action keywords found, default to backend-developer
  // This handles prompts like "Authentication system with JWT"
  if (roles.length === 0) {
    const domain = determineBackendVsFrontend(tokens);
    roles.push(
      domain === 'backend'
        ? AgentRole.BACKEND_DEVELOPER
        : AgentRole.FRONTEND_DEVELOPER
    );
  }

  return {
    roles,
    keywords,
  };
}
