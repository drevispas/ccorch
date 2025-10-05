/**
 * Complexity Analyzer Configuration Types
 *
 * Purpose: Define interfaces for the pluggable complexity analysis system.
 * Enables easy customization, extension, and project-specific configurations.
 */

import type { Intent, Complexity, AgentRole } from '../../types/workflow';

// ============================================================================
// Core Configuration Interface
// ============================================================================

/**
 * Complete complexity analyzer configuration
 */
export interface ComplexityConfig {
  /** Configuration version for migration support */
  version: string;

  /** Pluggable scoring factors */
  factors: ComplexityFactor[];

  /** Keyword registry for pattern matching */
  keywords: KeywordRegistry;

  /** Score thresholds for complexity levels */
  thresholds: ComplexityThresholds;

  /** Default weights for factors (used if factor doesn't specify) */
  defaultWeights: FactorWeightMap;

  /** Optional role-based scoring adjustments */
  roleAdjustments?: RoleAdjustmentMap;

  /** Feature flags for optional behaviors */
  features: FeatureFlags;
}

// ============================================================================
// Scoring Factor System
// ============================================================================

/**
 * Pluggable complexity factor definition
 */
export interface ComplexityFactor {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Weight in overall score (0-1), overrides defaultWeights if set */
  weight?: number;

  /** Whether this factor is active */
  enabled: boolean;

  /** Evaluation function */
  evaluate: FactorEvaluator;

  /** Optional metadata for custom factors */
  metadata?: Record<string, any>;
}

/**
 * Factor evaluation function signature
 */
export type FactorEvaluator = (
  prompt: string,
  intent: Intent,
  context: EvaluationContext
) => FactorScore;

/**
 * Context provided to factor evaluators
 */
export interface EvaluationContext {
  /** Keyword registry for matching */
  keywords: KeywordRegistry;

  /** Feature flags */
  features: FeatureFlags;

  /** Role adjustments (if any) */
  roleAdjustments?: RoleAdjustmentMap;
}

/**
 * Result from factor evaluation
 */
export interface FactorScore {
  /** Normalized score (0-1) */
  score: number;

  /** Confidence in this score (0-1) */
  confidence: number;

  /** Evidence/reasons for this score */
  evidence: string[];
}

/**
 * Map of factor IDs to weights
 */
export type FactorWeightMap = Record<string, number>;

// ============================================================================
// Keyword Registry
// ============================================================================

/**
 * Comprehensive keyword registry for complexity detection
 */
export interface KeywordRegistry {
  /** Explicit complexity modifiers */
  modifiers: {
    simple: KeywordDefinition[];
    complex: KeywordDefinition[];
  };

  /** Scope indicators */
  scope: {
    single: KeywordDefinition[];   // Single file/function
    few: KeywordDefinition[];      // Few files (2-5)
    many: KeywordDefinition[];     // Many files (6+)
    system: KeywordDefinition[];   // System-wide/multi-module
  };

  /** Dependency indicators */
  dependencies: {
    none: KeywordDefinition[];
    few: KeywordDefinition[];      // 1-2 integrations
    many: KeywordDefinition[];     // 3+ integrations
  };

  /** Risk/impact indicators */
  risk: {
    low: KeywordDefinition[];      // Low risk (add, new, extend)
    medium: KeywordDefinition[];   // Medium risk (update, modify)
    high: KeywordDefinition[];     // High risk (migrate, breaking)
  };

  /** Numeric pattern extractors */
  numericPatterns: NumericPattern[];
}

/**
 * Keyword definition with metadata
 */
export interface KeywordDefinition {
  /** The keyword to match */
  keyword: string;

  /** Impact weight (0-1) */
  weight: number;

  /** Alternative forms */
  aliases?: string[];

  /** Case-sensitive matching */
  caseSensitive?: boolean;

  /** Must appear with other keywords */
  requiresContext?: boolean;
}

/**
 * Pattern for extracting numeric hints from prompts
 */
export interface NumericPattern {
  /** Regex pattern to match */
  pattern: RegExp;

  /** Extract number from match */
  extract: (match: string) => number;

  /** Which factor this applies to */
  factor: 'scope' | 'dependencies' | 'risk';

  /** Optional weight multiplier */
  weight?: number;
}

// ============================================================================
// Thresholds & Adjustments
// ============================================================================

/**
 * Score thresholds for complexity levels
 */
export interface ComplexityThresholds {
  /** Below this score = SIMPLE */
  simple: number;

  /** Above this score = COMPLEX */
  complex: number;

  /** Between simple and complex = MODERATE */
  // (implicit: >= simple && < complex)
}

/**
 * Role-based scoring adjustments
 */
export type RoleAdjustmentMap = Partial<Record<AgentRole, RoleAdjustment>>;

/**
 * Adjustment for specific agent role
 */
export interface RoleAdjustment {
  /** Multiply final score by this value */
  multiplier: number;

  /** Add this value to final score */
  offset?: number;

  /** Reason for adjustment */
  reason?: string;
}

// ============================================================================
// Feature Flags
// ============================================================================

/**
 * Optional feature flags
 */
export interface FeatureFlags {
  /** Parse numeric hints like "modify 5 files" */
  useNumericHints: boolean;

  /** Apply role-based complexity adjustments */
  useRoleBias: boolean;

  /** Require minimum confidence threshold */
  strictMode: boolean;

  /** Minimum confidence (if strictMode enabled) */
  minConfidence?: number;
}

// ============================================================================
// Configuration Overrides
// ============================================================================

/**
 * Partial config overrides for runtime customization
 */
export interface ConfigOverrides {
  thresholds?: Partial<ComplexityThresholds>;
  weights?: Partial<FactorWeightMap>;
  features?: Partial<FeatureFlags>;
  enabledFactors?: string[];
  disabledFactors?: string[];
}

// ============================================================================
// Analysis Result
// ============================================================================

/**
 * Detailed complexity analysis result
 */
export interface ComplexityAnalysisResult {
  /** Final complexity level */
  complexity: Complexity;

  /** Raw score (0-1) */
  score: number;

  /** Overall confidence (0-1) */
  confidence: number;

  /** Breakdown by factor */
  factorScores: FactorScoreBreakdown[];

  /** Evidence summary */
  evidence: string[];

  /** Config version used */
  configVersion: string;
}

/**
 * Individual factor's contribution
 */
export interface FactorScoreBreakdown {
  /** Factor ID */
  factorId: string;

  /** Factor name */
  factorName: string;

  /** Raw factor score (0-1) */
  rawScore: number;

  /** Weight applied */
  weight: number;

  /** Weighted contribution to total */
  weightedScore: number;

  /** Confidence */
  confidence: number;

  /** Evidence */
  evidence: string[];
}
