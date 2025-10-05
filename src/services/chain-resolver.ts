/**
 * Chain Resolver Service
 *
 * Purpose: Map parsed intent to workflow chains and agent sequences.
 * Determines which of the 10 workflow chains to execute based on detected roles.
 *
 * PRD Reference: §4.2 Workflow Chains, §5.2 Step 2 - Resolve Chain
 */

import type { Intent } from '../types/workflow';
import { ChainName, AgentRole } from '../types/workflow';

/**
 * Result of chain resolution
 */
export interface ChainResolution {
  chainName: ChainName;
  agentSequence: AgentRole[];
}

/**
 * Backend-specific keywords for domain detection
 */
const BACKEND_KEYWORDS = [
  'java',
  'api',
  'rest',
  'database',
  'db',
  'sql',
  'controller',
  'service',
  'endpoint',
  'server',
  'backend',
  'spring',
  'jpa',
  'hibernate',
  'microservice',
];

/**
 * Frontend-specific keywords for domain detection
 */
const FRONTEND_KEYWORDS = [
  'ui',
  'ux',
  'component',
  'page',
  'react',
  'vue',
  'angular',
  'button',
  'form',
  'frontend',
  'html',
  'css',
  'dom',
  'jsx',
  'tsx',
];

// ============================================================================
// Main Resolution Function
// ============================================================================

/**
 * Resolve workflow chain based on intent
 *
 * @param intent - Parsed intent from prompt parser
 * @param prompt - Original user prompt (optional, for detecting modifiers like "just", "no changes")
 * @returns Chain name and agent sequence
 *
 * @example
 * ```typescript
 * const intent = parseIntent('Implement REST API');
 * const result = resolveChain(intent, 'Implement REST API');
 * // Returns: { chainName: 'backend-development', agentSequence: [...] }
 * ```
 */
export function resolveChain(intent: Intent, prompt?: string): ChainResolution {
  const { roles, keywords } = intent;
  const promptLower = prompt?.toLowerCase() || '';

  // Determine if backend or frontend based on keywords
  const isBackend = determineBackendVsFrontend(keywords);

  // Detect specific role combinations
  const hasDebugger = roles.includes(AgentRole.DEBUGGER);
  const hasReviewer = roles.includes(AgentRole.REVIEWER);
  const hasBackendArchitect = roles.includes(AgentRole.BACKEND_ARCHITECT);
  const hasFrontendArchitect = roles.includes(AgentRole.FRONTEND_ARCHITECT);
  const hasBackendDeveloper = roles.includes(AgentRole.BACKEND_DEVELOPER);
  const hasFrontendDeveloper = roles.includes(AgentRole.FRONTEND_DEVELOPER);

  const hasArchitect = hasBackendArchitect || hasFrontendArchitect;
  const hasDeveloper = hasBackendDeveloper || hasFrontendDeveloper;

  // ========================================================================
  // Priority 1: Debug chains (highest priority for bug fixes)
  // ========================================================================
  if (hasDebugger) {
    // Check if it's debug-only (investigation without fixes)
    // Only if explicit investigation keywords present
    if (hasInvestigationKeywords(keywords, promptLower)) {
      return {
        chainName: ChainName.DEBUG_ONLY,
        agentSequence: [AgentRole.DEBUGGER],
      };
    }

    // Default debug chain: debugger → developer → reviewer (includes fixes)
    const developerRole = isBackend
      ? AgentRole.BACKEND_DEVELOPER
      : AgentRole.FRONTEND_DEVELOPER;

    return {
      chainName: ChainName.DEBUG,
      agentSequence: [AgentRole.DEBUGGER, developerRole, AgentRole.REVIEWER],
    };
  }

  // ========================================================================
  // Priority 2: Review chains
  // ========================================================================
  if (hasReviewer) {
    // Check if it's review-only (no changes needed)
    // Even if developer role is detected, review-only keywords take precedence
    if (hasReviewOnlyKeywords(keywords, promptLower)) {
      return {
        chainName: ChainName.REVIEW_ONLY,
        agentSequence: [AgentRole.REVIEWER],
      };
    }

    // If only reviewer role (no developer/architect), it's review-only
    if (!hasDeveloper && !hasArchitect) {
      return {
        chainName: ChainName.REVIEW_ONLY,
        agentSequence: [AgentRole.REVIEWER],
      };
    }

    // Review chain: reviewer → developer
    const developerRole = isBackend
      ? AgentRole.BACKEND_DEVELOPER
      : AgentRole.FRONTEND_DEVELOPER;

    return {
      chainName: ChainName.REVIEW,
      agentSequence: [AgentRole.REVIEWER, developerRole],
    };
  }

  // ========================================================================
  // Priority 3: Design-only chains (architect without developer)
  // ========================================================================
  if (hasArchitect && !hasDeveloper) {
    if (isBackend || hasBackendArchitect) {
      return {
        chainName: ChainName.BACKEND_DESIGN_ONLY,
        agentSequence: [AgentRole.BACKEND_ARCHITECT],
      };
    } else {
      return {
        chainName: ChainName.FRONTEND_DESIGN_ONLY,
        agentSequence: [AgentRole.FRONTEND_ARCHITECT],
      };
    }
  }

  // ========================================================================
  // Priority 4: Implementation-only chains (developer without architect)
  // ========================================================================
  if (hasDeveloper && !hasArchitect) {
    // Check if this is a small implementation-only task (e.g., "add", "update existing")
    if (isImplementationOnlyTask(keywords, promptLower)) {
      if (isBackend || hasBackendDeveloper) {
        return {
          chainName: ChainName.BACKEND_ONLY,
          agentSequence: [AgentRole.BACKEND_DEVELOPER],
        };
      } else {
        return {
          chainName: ChainName.FRONTEND_ONLY,
          agentSequence: [AgentRole.FRONTEND_DEVELOPER],
        };
      }
    }

    // Otherwise, use full development chain (includes design phase)
    // For significant tasks like "implement API", "build feature", etc.
    if (isBackend || hasBackendDeveloper) {
      return {
        chainName: ChainName.BACKEND_DEVELOPMENT,
        agentSequence: [
          AgentRole.BACKEND_ARCHITECT,
          AgentRole.BACKEND_DEVELOPER,
          AgentRole.REVIEWER,
        ],
      };
    } else {
      return {
        chainName: ChainName.FRONTEND_DEVELOPMENT,
        agentSequence: [
          AgentRole.FRONTEND_ARCHITECT,
          AgentRole.FRONTEND_DEVELOPER,
          AgentRole.REVIEWER,
        ],
      };
    }
  }

  // ========================================================================
  // Priority 5: Full development chains (architect + developer)
  // ========================================================================
  if (hasArchitect && hasDeveloper) {
    if (isBackend || hasBackendArchitect || hasBackendDeveloper) {
      return {
        chainName: ChainName.BACKEND_DEVELOPMENT,
        agentSequence: [
          AgentRole.BACKEND_ARCHITECT,
          AgentRole.BACKEND_DEVELOPER,
          AgentRole.REVIEWER,
        ],
      };
    } else {
      return {
        chainName: ChainName.FRONTEND_DEVELOPMENT,
        agentSequence: [
          AgentRole.FRONTEND_ARCHITECT,
          AgentRole.FRONTEND_DEVELOPER,
          AgentRole.REVIEWER,
        ],
      };
    }
  }

  // ========================================================================
  // Default: Backend development chain
  // ========================================================================
  // If no specific roles detected, default to backend development
  // (PRD §4.2: default to backend when ambiguous)
  return {
    chainName: ChainName.BACKEND_DEVELOPMENT,
    agentSequence: [
      AgentRole.BACKEND_ARCHITECT,
      AgentRole.BACKEND_DEVELOPER,
      AgentRole.REVIEWER,
    ],
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine if task is backend or frontend based on keywords
 *
 * @param keywords - Keywords extracted from prompt
 * @returns true if backend, false if frontend
 */
function determineBackendVsFrontend(keywords: string[]): boolean {
  const lowerKeywords = keywords.map((k) => k.toLowerCase());

  // Count backend and frontend keyword matches
  let backendCount = 0;
  let frontendCount = 0;

  for (const keyword of lowerKeywords) {
    if (BACKEND_KEYWORDS.some((bk) => keyword.includes(bk))) {
      backendCount++;
    }
    if (FRONTEND_KEYWORDS.some((fk) => keyword.includes(fk))) {
      frontendCount++;
    }
  }

  // If frontend keywords dominate, it's frontend
  if (frontendCount > backendCount) {
    return false;
  }

  // Default to backend (PRD §4.2)
  return true;
}

/**
 * Check if keywords suggest investigation-only (no fixes)
 *
 * Returns true if:
 * 1. Contains investigation-only keywords (investigate, analyze), OR
 * 2. Contains only passive issue keywords without fix action words
 */
function hasInvestigationKeywords(keywords: string[], prompt: string): boolean {
  const lowerKeywords = keywords.map((k) => k.toLowerCase());

  // Check original prompt for investigation words
  const investigationWords = ['investigate', 'analyze', 'check', 'inspect'];
  if (investigationWords.some((word) => prompt.includes(word))) {
    return true;
  }

  // If contains only passive issue keywords without fix actions
  const passiveWords = ['issue', 'problem', 'error', 'bug', 'performance'];
  const actionWords = ['fix', 'debug', 'resolve', 'troubleshoot'];

  const hasPassiveWords = passiveWords.some((word) =>
    lowerKeywords.some((k) => k.includes(word))
  );
  const hasActionWords = actionWords.some((word) =>
    lowerKeywords.some((k) => k.includes(word))
  );

  // If has passive words but no action words, it's investigation-only
  return hasPassiveWords && !hasActionWords;
}

/**
 * Check if keywords suggest review-only (no changes)
 *
 * Returns true only if explicit review-only indicators are present
 */
function hasReviewOnlyKeywords(keywords: string[], prompt: string): boolean {
  // Check original prompt for review-only modifiers
  const reviewOnlyIndicators = ['just review', 'only review', 'no changes', 'no fixes', 'without changes', 'without fixes'];

  return reviewOnlyIndicators.some((indicator) => prompt.includes(indicator));
}

/**
 * Check if task is a small implementation-only task (no design needed)
 *
 * Returns true for small tasks like "add field", "update existing"
 * Returns false for significant tasks like "implement API", "build feature"
 */
function isImplementationOnlyTask(keywords: string[], prompt: string): boolean {
  // Check original prompt for "existing" - strong indicator of small change
  if (prompt.includes('existing')) {
    return true;
  }

  const lowerKeywords = keywords.map((k) => k.toLowerCase());

  // Modification action keywords alone indicate small changes
  const modificationKeywords = ['update', 'modify', 'change', 'rename', 'remove', 'delete'];
  const hasModification = modificationKeywords.some((action) =>
    lowerKeywords.some((k) => k.includes(action))
  );

  if (hasModification) {
    return true;
  }

  // Small-scope keywords only when combined with "add" action
  const smallScopeKeywords = ['field', 'column', 'property', 'parameter', 'attribute'];
  const hasAdd = lowerKeywords.some((k) => k.includes('add'));
  const hasSmallScope = smallScopeKeywords.some((scope) =>
    lowerKeywords.some((k) => k.includes(scope)) || prompt.includes(scope)
  );

  // "Add field/column/property" is small-scope implementation-only
  if (hasAdd && hasSmallScope) {
    return true;
  }

  return false;
}
