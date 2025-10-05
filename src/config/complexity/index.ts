/**
 * Complexity Analyzer Configuration Module
 *
 * Purpose: Centralized exports for the pluggable complexity analysis system.
 */

// Type definitions
export type {
  ComplexityConfig,
  ComplexityFactor,
  FactorEvaluator,
  FactorScore,
  EvaluationContext,
  FactorWeightMap,
  KeywordRegistry,
  KeywordDefinition,
  NumericPattern,
  ComplexityThresholds,
  RoleAdjustmentMap,
  RoleAdjustment,
  FeatureFlags,
  ConfigOverrides,
  ComplexityAnalysisResult,
  FactorScoreBreakdown,
} from './types';

// Default configuration
export { DEFAULT_COMPLEXITY_CONFIG } from './default-config';
export { DEFAULT_KEYWORD_REGISTRY } from './keyword-registry';
export { DEFAULT_SCORING_FACTORS } from './scoring-factors';
export {
  DEFAULT_THRESHOLDS,
  DEFAULT_FACTOR_WEIGHTS,
  DEFAULT_ROLE_ADJUSTMENTS,
  DEFAULT_FEATURE_FLAGS,
} from './default-config';

// Individual factors (for custom configurations)
export {
  scopeFactor,
  dependenciesFactor,
  riskFactor,
  keywordModifiersFactor,
} from './scoring-factors';
