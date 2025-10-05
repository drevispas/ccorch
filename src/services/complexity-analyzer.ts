/**
 * Complexity Analyzer Service
 *
 * Purpose: Analyze user prompts to determine task complexity (simple, moderate, complex)
 * using a pluggable, configuration-driven scoring system.
 *
 * PRD Reference: §5.2 Step 3 - Determine Complexity
 */

import type { Intent, Complexity } from '../types/workflow';
import { Complexity as ComplexityEnum } from '../types/workflow';
import type {
  ComplexityConfig,
  ConfigOverrides,
  EvaluationContext,
  FactorScoreBreakdown,
  ComplexityAnalysisResult,
} from '../config/complexity';
import { DEFAULT_COMPLEXITY_CONFIG } from '../config/complexity';

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Analyze prompt complexity using configured scoring factors
 *
 * @param prompt - User's task description
 * @param intent - Parsed intent from prompt parser
 * @param overrides - Optional runtime configuration overrides
 * @returns Complexity level (SIMPLE, MODERATE, or COMPLEX)
 *
 * @example
 * ```typescript
 * const intent = parseIntent('Implement REST API');
 * const complexity = analyzeComplexity('Implement REST API', intent);
 * // Returns: Complexity.MODERATE
 * ```
 */
export function analyzeComplexity(
  prompt: string,
  intent: Intent,
  overrides?: ConfigOverrides
): Complexity {
  const result = analyzeComplexityDetailed(prompt, intent, overrides);
  return result.complexity;
}

/**
 * Analyze prompt complexity with detailed breakdown
 *
 * Returns comprehensive analysis including scores, confidence, and evidence.
 *
 * @param prompt - User's task description
 * @param intent - Parsed intent from prompt parser
 * @param overrides - Optional runtime configuration overrides
 * @returns Detailed analysis result
 */
export function analyzeComplexityDetailed(
  prompt: string,
  intent: Intent,
  overrides?: ConfigOverrides
): ComplexityAnalysisResult {
  // Apply configuration with overrides
  const config = applyConfigOverrides(DEFAULT_COMPLEXITY_CONFIG, overrides);

  // Build evaluation context
  const context: EvaluationContext = {
    keywords: config.keywords,
    features: config.features,
    roleAdjustments: config.roleAdjustments,
  };

  // Evaluate all enabled factors
  const factorBreakdowns: FactorScoreBreakdown[] = [];
  let totalWeightedScore = 0;
  let totalWeight = 0;
  const allEvidence: string[] = [];

  for (const factor of config.factors) {
    if (!factor.enabled) continue;

    // Evaluate this factor
    const factorScore = factor.evaluate(prompt, intent, context);

    // Get weight (factor-specific or default)
    const weight = factor.weight !== undefined
      ? factor.weight
      : (config.defaultWeights[factor.id] || 0);

    // Calculate weighted contribution
    const weightedScore = factorScore.score * weight;

    // Record breakdown
    factorBreakdowns.push({
      factorId: factor.id,
      factorName: factor.name,
      rawScore: factorScore.score,
      weight,
      weightedScore,
      confidence: factorScore.confidence,
      evidence: factorScore.evidence,
    });

    // Accumulate
    totalWeightedScore += weightedScore;
    totalWeight += weight;
    allEvidence.push(...factorScore.evidence);
  }

  // Normalize score (in case weights don't sum to 1.0)
  let finalScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0.5;

  // Apply role-based adjustments if enabled
  if (config.features.useRoleBias && config.roleAdjustments) {
    for (const role of intent.roles) {
      const adjustment = config.roleAdjustments[role];
      if (adjustment) {
        finalScore *= adjustment.multiplier;
        if (adjustment.offset) {
          finalScore += adjustment.offset;
        }
        if (adjustment.reason) {
          allEvidence.push(`Role adjustment: ${adjustment.reason}`);
        }
      }
    }
  }

  // Clamp score to [0, 1]
  finalScore = Math.max(0, Math.min(1, finalScore));

  // Calculate overall confidence (average of factor confidences)
  const avgConfidence = factorBreakdowns.length > 0
    ? factorBreakdowns.reduce((sum, fb) => sum + fb.confidence, 0) / factorBreakdowns.length
    : 0.5;

  // Determine complexity level based on thresholds
  const complexity = determineComplexityLevel(finalScore, config.thresholds);

  return {
    complexity,
    score: finalScore,
    confidence: avgConfidence,
    factorScores: factorBreakdowns,
    evidence: allEvidence,
    configVersion: config.version,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine complexity level from score and thresholds
 */
function determineComplexityLevel(
  score: number,
  thresholds: { simple: number; complex: number }
): Complexity {
  if (score < thresholds.simple) {
    return ComplexityEnum.SIMPLE;
  }

  if (score >= thresholds.complex) {
    return ComplexityEnum.COMPLEX;
  }

  return ComplexityEnum.MODERATE;
}

/**
 * Apply runtime configuration overrides
 */
function applyConfigOverrides(
  baseConfig: ComplexityConfig,
  overrides?: ConfigOverrides
): ComplexityConfig {
  if (!overrides) return baseConfig;

  const config = { ...baseConfig };

  // Apply threshold overrides
  if (overrides.thresholds) {
    config.thresholds = {
      ...config.thresholds,
      ...overrides.thresholds,
    };
  }

  // Apply weight overrides
  if (overrides.weights) {
    const weightOverrides = Object.entries(overrides.weights).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, { ...config.defaultWeights });

    config.defaultWeights = weightOverrides;
  }

  // Apply feature flag overrides
  if (overrides.features) {
    config.features = {
      ...config.features,
      ...overrides.features,
    };
  }

  // Apply factor enable/disable overrides
  if (overrides.enabledFactors || overrides.disabledFactors) {
    config.factors = config.factors.map(factor => {
      let enabled = factor.enabled;

      if (overrides.enabledFactors?.includes(factor.id)) {
        enabled = true;
      }

      if (overrides.disabledFactors?.includes(factor.id)) {
        enabled = false;
      }

      return { ...factor, enabled };
    });
  }

  return config;
}
