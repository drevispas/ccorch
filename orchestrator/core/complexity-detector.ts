/**
 * Complexity Detection System for Agent Task Complexity
 *
 * Analyzes task descriptions to determine appropriate complexity level:
 * - Simple: Quick, direct solutions
 * - Moderate: Balanced approach with best practices
 * - Complex: Deep analysis with all production considerations
 */

export type Complexity = 'simple' | 'moderate' | 'complex';

export interface ComplexityAnalysis {
  complexity: Complexity;
  confidence: number;
  indicators: string[];
  reasoning: string;
}

/**
 * Keywords that indicate a simple approach is sufficient
 */
const SIMPLE_INDICATORS = [
  'quick', 'basic', 'simple', 'initial', 'poc', 'prototype',
  'draft', 'rough', 'minimal', 'starter', 'demo', 'example',
  'test', 'trial', 'experiment', 'temporary', 'placeholder', 'dummy'
];

/**
 * Keywords that indicate complex approach is required
 */
const COMPLEX_INDICATORS = [
  'production', 'enterprise', 'scalable', 'optimize', 'optimiz',
  'secure', 'distributed', 'microservice', 'performance',
  'mission-critical', 'high-availability', 'fault-tolerant',
  'compliance', 'audit', 'monitoring', 'observability',
  'disaster-recovery', 'backup', 'redundant', 'resilient',
  'encryption', 'authentication', 'authorization', 'security'
];

/**
 * Phrases that indicate complex complexity regardless of individual words
 */
const COMPLEX_PHRASES = [
  'zero downtime', 'high performance', 'large scale', 'enterprise grade',
  'production ready', 'industry standard', 'best practices',
  'security hardening', 'threat modeling', 'load balancing'
];

/**
 * Detect the appropriate complexity level for a given task description
 */
export function detectComplexity(taskDescription: string): Complexity {
  const analysis = analyzeComplexity(taskDescription);
  return analysis.complexity;
}

/**
 * Perform detailed complexity analysis with reasoning
 */
export function analyzeComplexity(taskDescription: string): ComplexityAnalysis {
  const lowerTask = taskDescription.toLowerCase();

  // Check for complex phrases first (highest priority)
  const complexPhrases = COMPLEX_PHRASES.filter(phrase => lowerTask.includes(phrase));
  if (complexPhrases.length > 0) {
    return {
      complexity: 'complex',
      confidence: 0.9,
      indicators: complexPhrases,
      reasoning: 'Contains phrases indicating production/enterprise requirements'
    };
  }

  // Count indicators
  const simpleMatches = SIMPLE_INDICATORS.filter(indicator => lowerTask.includes(indicator));
  const complexMatches = COMPLEX_INDICATORS.filter(indicator => lowerTask.includes(indicator));

  // Strong simple indicators (2+ matches)
  if (simpleMatches.length >= 2) {
    return {
      complexity: 'simple',
      confidence: 0.8,
      indicators: simpleMatches,
      reasoning: 'Multiple indicators suggest quick/simple approach is sufficient'
    };
  }

  // Strong complex indicators (2+ matches)
  if (complexMatches.length >= 2) {
    return {
      complexity: 'complex',
      confidence: 0.8,
      indicators: complexMatches,
      reasoning: 'Multiple indicators suggest production-level considerations needed'
    };
  }

  // Single strong complex indicator
  if (complexMatches.length === 1) {
    return {
      complexity: 'complex',
      confidence: 0.7,
      indicators: complexMatches,
      reasoning: 'Production/enterprise keyword detected'
    };
  }

  // Single simple indicator
  if (simpleMatches.length === 1) {
    return {
      complexity: 'simple',
      confidence: 0.6,
      indicators: simpleMatches,
      reasoning: 'Simple/basic keyword detected'
    };
  }

  // Default to moderate complexity
  return {
    complexity: 'moderate',
    confidence: 0.5,
    indicators: [],
    reasoning: 'No clear complexity indicators - using balanced approach'
  };
}

/**
 * Get human-readable description of complexity level
 */
export function getComplexityDescription(complexity: Complexity): string {
  switch (complexity) {
    case 'simple': return 'Simple - Direct, functional solutions';
    case 'moderate': return 'Moderate - Balanced approach with best practices';
    case 'complex': return 'Complex - Deep analysis with all production considerations';
    default: return 'Unknown complexity level';
  }
}