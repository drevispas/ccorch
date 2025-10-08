/**
 * Built-in Complexity Scoring Factors
 *
 * Purpose: Default pluggable factors for complexity analysis.
 * Each factor evaluates a specific aspect (scope, dependencies, risk, keywords).
 *
 * Teams can:
 * - Disable built-in factors
 * - Adjust weights
 * - Add custom factors
 */

import type {
  ComplexityFactor,
  FactorEvaluator,
  KeywordDefinition,
  NumericPattern,
} from './types';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Tokenize prompt into lowercase words
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 0);
}

/**
 * Check if any keywords from a list are present in tokens
 */
function hasKeywords(tokens: string[], keywords: KeywordDefinition[]): boolean {
  const keywordStrings = keywords.flatMap(k => [
    k.keyword,
    ...(k.aliases || []),
  ]);

  return tokens.some(token => keywordStrings.includes(token));
}

/**
 * Calculate weighted score from matching keywords
 */
function calculateKeywordScore(
  tokens: string[],
  keywords: KeywordDefinition[]
): number {
  let totalWeight = 0;
  const matches: string[] = [];

  for (const def of keywords) {
    const allForms = [def.keyword, ...(def.aliases || [])];

    for (const form of allForms) {
      if (tokens.includes(form)) {
        totalWeight += def.weight;
        matches.push(form);
        break; // Don't count aliases multiple times
      }
    }
  }

  return matches.length > 0 ? Math.min(1.0, totalWeight / matches.length) : 0;
}

/**
 * Extract numeric hints from prompt using patterns
 */
function extractNumericHints(
  prompt: string,
  factor: 'scope' | 'dependencies' | 'risk',
  patterns: NumericPattern[]
): { value: number; evidence: string } | null {
  for (const pattern of patterns) {
    if (pattern.factor !== factor) continue;

    const match = prompt.match(pattern.pattern);
    if (match) {
      const value = pattern.extract(match[0]);
      return {
        value,
        evidence: `Numeric hint: ${match[0]}`,
      };
    }
  }

  return null;
}

// ============================================================================
// Scope Factor (35% default weight)
// ============================================================================

const evaluateScopeFactor: FactorEvaluator = (prompt, intent, context) => {
  const tokens = tokenize(prompt);
  const keywords = context.keywords;
  const evidence: string[] = [];
  let score = 0.5; // Default to moderate

  // Check for single file/function indicators
  if (hasKeywords(tokens, keywords.scope.single)) {
    score = Math.min(score, 0.2);
    evidence.push('Single file/function scope detected');
  }

  // Check for few files
  if (hasKeywords(tokens, keywords.scope.few)) {
    score = 0.4;
    evidence.push('Few files scope detected');
  }

  // Check for many files
  if (hasKeywords(tokens, keywords.scope.many)) {
    score = Math.max(score, 0.7);
    evidence.push('Multiple files scope detected');
  }

  // Check for system-wide indicators (very strong signal)
  if (hasKeywords(tokens, keywords.scope.system)) {
    score = 1.0;  // Max score for system-wide
    evidence.push('System-wide scope detected');
  }

  // Numeric hints (if feature enabled)
  if (context.features.useNumericHints) {
    const numericHint = extractNumericHints(
      prompt,
      'scope',
      keywords.numericPatterns
    );

    if (numericHint) {
      const fileCount = numericHint.value;
      if (fileCount === 1) {
        score = Math.min(score, 0.2);
      } else if (fileCount <= 5) {
        score = 0.5;
      } else if (fileCount <= 10) {
        score = 0.8;
      } else {
        score = 1.0;  // 10+ files is definitely complex
      }
      evidence.push(numericHint.evidence);
    }
  }

  return {
    score,
    confidence: evidence.length > 0 ? 0.8 : 0.5,
    evidence,
  };
};

export const scopeFactor: ComplexityFactor = {
  id: 'scope',
  name: 'Task Scope',
  enabled: true,
  evaluate: evaluateScopeFactor,
};

// ============================================================================
// Dependencies Factor (30% default weight)
// ============================================================================

const evaluateDependenciesFactor: FactorEvaluator = (prompt, intent, context) => {
  const tokens = tokenize(prompt);
  const keywords = context.keywords;
  const evidence: string[] = [];
  let score = 0.5; // Default to moderate

  // Check for no dependencies
  if (hasKeywords(tokens, keywords.dependencies.none)) {
    score = 0.1;
    evidence.push('Standalone/isolated task');
  }

  // Check for few dependencies
  if (hasKeywords(tokens, keywords.dependencies.few)) {
    score = Math.max(score, 0.5);
    evidence.push('Few integrations/dependencies');
  }

  // Count how many specific dependency technologies are mentioned
  const dependencyCount = keywords.dependencies.many.filter(def => {
    const allForms = [def.keyword, ...(def.aliases || [])];
    return tokens.some(token => allForms.includes(token));
  }).length;

  // Check for many dependencies (strong signal)
  if (dependencyCount >= 3) {
    // 3+ specific dependencies = definitely complex
    score = 1.0;
    evidence.push(`${dependencyCount} external dependencies detected`);
  } else if (dependencyCount >= 2) {
    score = 0.9;
    evidence.push(`${dependencyCount} external dependencies detected`);
  } else if (hasKeywords(tokens, keywords.dependencies.many)) {
    score = 0.95;  // Very high score for multiple dependencies
    evidence.push('Multiple external dependencies detected');
  }

  // Numeric hints for integrations
  if (context.features.useNumericHints) {
    const numericHint = extractNumericHints(
      prompt,
      'dependencies',
      keywords.numericPatterns
    );

    if (numericHint) {
      const depCount = numericHint.value;
      if (depCount === 0) {
        score = 0.1;
      } else if (depCount <= 2) {
        score = 0.5;
      } else {
        score = 1.0;
      }
      evidence.push(numericHint.evidence);
    }
  }

  return {
    score,
    confidence: evidence.length > 0 ? 0.7 : 0.4,
    evidence,
  };
};

export const dependenciesFactor: ComplexityFactor = {
  id: 'dependencies',
  name: 'External Dependencies',
  enabled: true,
  evaluate: evaluateDependenciesFactor,
};

// ============================================================================
// Risk Factor (20% default weight)
// ============================================================================

const evaluateRiskFactor: FactorEvaluator = (prompt, intent, context) => {
  const tokens = tokenize(prompt);
  const keywords = context.keywords;
  const evidence: string[] = [];
  let score = 0.5; // Default to moderate

  // Check for high risk indicators
  if (hasKeywords(tokens, keywords.risk.high)) {
    score = 0.9;
    evidence.push('High risk changes detected (breaking/schema/migration)');
  }
  // Check for medium risk
  else if (hasKeywords(tokens, keywords.risk.medium)) {
    score = 0.5;
    evidence.push('Medium risk changes (updates/modifications)');
  }
  // Check for low risk
  else if (hasKeywords(tokens, keywords.risk.low)) {
    score = 0.2;
    evidence.push('Low risk changes (additions/extensions)');
  }

  return {
    score,
    confidence: evidence.length > 0 ? 0.8 : 0.5,
    evidence,
  };
};

export const riskFactor: ComplexityFactor = {
  id: 'risk',
  name: 'Change Risk',
  enabled: true,
  evaluate: evaluateRiskFactor,
};

// ============================================================================
// Keyword Modifiers Factor (15% default weight)
// ============================================================================

const evaluateKeywordModifiersFactor: FactorEvaluator = (
  prompt,
  intent,
  context
) => {
  const tokens = tokenize(prompt);
  const keywords = context.keywords;
  const evidence: string[] = [];

  // Calculate simple and complex keyword scores
  const simpleScore = calculateKeywordScore(tokens, keywords.modifiers.simple);
  const complexScore = calculateKeywordScore(
    tokens,
    keywords.modifiers.complex
  );

  // Net score: positive = complex, negative = simple
  // Amplify the effect by multiplying by 1.2 to give modifiers more influence
  const netScore = (complexScore - simpleScore) * 1.2;

  // Normalize to 0-1 range (0 = simple, 0.5 = neutral, 1 = complex)
  const normalizedScore = Math.max(0, Math.min(1, 0.5 + netScore));

  if (simpleScore > 0) {
    evidence.push(`Simple modifiers detected (score: ${simpleScore.toFixed(2)})`);
  }

  if (complexScore > 0) {
    evidence.push(`Complex modifiers detected (score: ${complexScore.toFixed(2)})`);
  }

  // High confidence if explicit modifiers present
  const confidence = simpleScore > 0 || complexScore > 0 ? 0.9 : 0.3;

  return {
    score: normalizedScore,
    confidence,
    evidence,
  };
};

export const keywordModifiersFactor: ComplexityFactor = {
  id: 'keyword-modifiers',
  name: 'Explicit Complexity Modifiers',
  enabled: true,
  evaluate: evaluateKeywordModifiersFactor,
};

// ============================================================================
// Assembled Default Factors
// ============================================================================

/**
 * Default set of built-in scoring factors
 *
 * Can be customized, disabled, or extended via configuration.
 */
export const DEFAULT_SCORING_FACTORS: ComplexityFactor[] = [
  scopeFactor,
  dependenciesFactor,
  riskFactor,
  keywordModifiersFactor,
];
