import { ComplexityLevel } from './enums';

// Re-export for backward compatibility
export { ComplexityLevel };

export interface ComplexityAnalysis {
  level: ComplexityLevel;
  factors: string[];
  score: number;
  recommendations: string[];
}

export class ComplexityDetector {
  analyzeComplexity(taskDescription: string): ComplexityAnalysis {
    const level = detectComplexity(taskDescription);
    const factors: string[] = [];
    let score = 0;
    const recommendations: string[] = [];

    const description = taskDescription.toLowerCase();

    // Analyze factors
    const complexKeywords = ['refactor', 'architect', 'redesign', 'migrate', 'integrate'];
    const moderateKeywords = ['implement', 'update', 'modify', 'enhance', 'optimize'];
    const simpleKeywords = ['fix', 'add', 'remove', 'change', 'update'];

    for (const keyword of complexKeywords) {
      if (description.includes(keyword)) {
        factors.push(`Contains complex keyword: ${keyword}`);
        score += 3;
      }
    }

    for (const keyword of moderateKeywords) {
      if (description.includes(keyword)) {
        factors.push(`Contains moderate keyword: ${keyword}`);
        score += 2;
      }
    }

    for (const keyword of simpleKeywords) {
      if (description.includes(keyword)) {
        factors.push(`Contains simple keyword: ${keyword}`);
        score += 1;
      }
    }

    // Add recommendations based on complexity
    if (level === ComplexityLevel.COMPLEX) {
      recommendations.push('Consider breaking down into smaller tasks');
      recommendations.push('Allocate extra time for testing');
      recommendations.push('Review with senior developers');
    } else if (level === ComplexityLevel.MODERATE) {
      recommendations.push('Standard review process recommended');
      recommendations.push('Include unit tests');
    } else {
      recommendations.push('Standard development process');
    }

    return {
      level,
      factors,
      score,
      recommendations
    };
  }
}

export function detectComplexity(taskDescription: string): ComplexityLevel {
  const description = taskDescription.toLowerCase();

  // Simple heuristics for complexity detection
  const complexKeywords = ['refactor', 'architect', 'redesign', 'migrate', 'integrate'];
  const moderateKeywords = ['implement', 'update', 'modify', 'enhance', 'optimize'];
  const simpleKeywords = ['fix', 'add', 'remove', 'change', 'update'];

  let score = 0;

  // Check for complex keywords
  for (const keyword of complexKeywords) {
    if (description.includes(keyword)) {
      score += 3;
    }
  }

  // Check for moderate keywords
  for (const keyword of moderateKeywords) {
    if (description.includes(keyword)) {
      score += 2;
    }
  }

  // Check for simple keywords
  for (const keyword of simpleKeywords) {
    if (description.includes(keyword)) {
      score += 1;
    }
  }

  // Length-based scoring
  if (description.length > 200) score += 2;
  else if (description.length > 100) score += 1;

  // Determine complexity level
  if (score >= 6) return ComplexityLevel.COMPLEX;
  if (score >= 3) return ComplexityLevel.MODERATE;
  return ComplexityLevel.SIMPLE;
}

export function analyzeComplexity(taskDescription: string): ComplexityAnalysis {
  const level = detectComplexity(taskDescription);
  const factors: string[] = [];
  const recommendations: string[] = [];

  // Analyze factors
  if (taskDescription.length > 200) {
    factors.push('Long task description');
  }

  if (taskDescription.toLowerCase().includes('multiple')) {
    factors.push('Multiple components involved');
  }

  if (taskDescription.toLowerCase().includes('test')) {
    factors.push('Testing required');
  }

  // Add recommendations based on complexity
  switch (level) {
    case ComplexityLevel.COMPLEX:
      recommendations.push('Break down into smaller tasks');
      recommendations.push('Create detailed plan before implementation');
      recommendations.push('Consider architectural review');
      break;
    case ComplexityLevel.MODERATE:
      recommendations.push('Plan implementation steps');
      recommendations.push('Include testing phase');
      break;
    case ComplexityLevel.SIMPLE:
      recommendations.push('Direct implementation possible');
      break;
  }

  return {
    level,
    factors,
    score: factors.length,
    recommendations
  };
}