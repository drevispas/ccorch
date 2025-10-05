/**
 * Default Complexity Analyzer Configuration
 *
 * Purpose: Assembles all components into a complete configuration.
 * Can be overridden via environment variables, project files, or runtime parameters.
 *
 * Based on PRD §5.2 complexity scoring rubric.
 */

import type {
  ComplexityConfig,
  ComplexityThresholds,
  FactorWeightMap,
  FeatureFlags,
  RoleAdjustmentMap,
} from './types';
import { DEFAULT_KEYWORD_REGISTRY } from './keyword-registry';
import { DEFAULT_SCORING_FACTORS } from './scoring-factors';
import { AgentRole } from '../../types/workflow';

// ============================================================================
// Thresholds (PRD §5.2)
// ============================================================================

/**
 * Default score thresholds for complexity levels
 *
 * Based on PRD scoring rubric:
 * - Below 0.35 = SIMPLE (single file, no dependencies, low risk)
 * - 0.35 to 0.65 = MODERATE (2-5 files, few dependencies, medium risk)
 * - Above 0.65 = COMPLEX (multi-module, multiple services, high risk)
 */
export const DEFAULT_THRESHOLDS: ComplexityThresholds = {
  simple: 0.35,    // < 0.35 = SIMPLE
  complex: 0.65,   // >= 0.65 = COMPLEX, between = MODERATE
};

// ============================================================================
// Factor Weights
// ============================================================================

/**
 * Default weights for scoring factors
 *
 * Total should sum to ~1.0 for normalized scoring.
 * Can be adjusted per-project or per-team.
 */
export const DEFAULT_FACTOR_WEIGHTS: FactorWeightMap = {
  'scope': 0.30,              // 30% - Most important
  'dependencies': 0.25,       // 25% - Second most important
  'risk': 0.20,               // 20% - Significant impact
  'keyword-modifiers': 0.25,  // 25% - Explicit overrides (increased for stronger influence)
};

// ============================================================================
// Role Adjustments (Optional)
// ============================================================================

/**
 * Optional role-based complexity adjustments
 *
 * Architect roles tend to work on higher complexity tasks.
 * Debugger roles tend to work on targeted, simpler fixes.
 */
export const DEFAULT_ROLE_ADJUSTMENTS: RoleAdjustmentMap = {
  [AgentRole.BACKEND_ARCHITECT]: {
    multiplier: 1.1,  // 10% increase
    reason: 'Architect roles typically work on higher complexity design tasks',
  },
  [AgentRole.FRONTEND_ARCHITECT]: {
    multiplier: 1.1,  // 10% increase
    reason: 'Architect roles typically work on higher complexity design tasks',
  },
  [AgentRole.DEBUGGER]: {
    multiplier: 0.9,  // 10% decrease
    reason: 'Debugger roles typically work on targeted fixes',
  },
};

// ============================================================================
// Feature Flags
// ============================================================================

/**
 * Default feature flags
 *
 * Can be overridden via environment variables:
 * - CCORCH_COMPLEXITY_NUMERIC_HINTS
 * - CCORCH_COMPLEXITY_ROLE_BIAS
 * - CCORCH_COMPLEXITY_STRICT_MODE
 */
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  useNumericHints: true,   // Parse "modify 5 files"
  useRoleBias: true,       // Apply role adjustments
  strictMode: false,       // Don't require minimum confidence
  minConfidence: 0.6,      // Minimum confidence threshold (if strictMode enabled)
};

// ============================================================================
// Complete Default Configuration
// ============================================================================

/**
 * Complete default configuration for complexity analyzer
 *
 * This can be extended or overridden:
 * 1. Via project config file (`.ccorch/complexity-config.json`)
 * 2. Via environment variables
 * 3. Via runtime parameters
 */
export const DEFAULT_COMPLEXITY_CONFIG: ComplexityConfig = {
  version: '1.0.0',
  factors: DEFAULT_SCORING_FACTORS,
  keywords: DEFAULT_KEYWORD_REGISTRY,
  thresholds: DEFAULT_THRESHOLDS,
  defaultWeights: DEFAULT_FACTOR_WEIGHTS,
  roleAdjustments: DEFAULT_ROLE_ADJUSTMENTS,
  features: DEFAULT_FEATURE_FLAGS,
};
