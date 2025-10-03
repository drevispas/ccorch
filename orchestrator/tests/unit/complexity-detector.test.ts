import {
  detectComplexity,
  analyzeComplexity,
  getComplexityDescription,
  Complexity,
  ComplexityAnalysis
} from '../../src/complexity-detector';

describe('Complexity Detection System', () => {
  describe('detectComplexity', () => {
    describe('Simple Complexity Detection', () => {
      test('should detect single simple indicators', () => {
        expect(detectComplexity('Create a simple API')).toBe('simple');
        expect(detectComplexity('Quick prototype needed')).toBe('simple');
        expect(detectComplexity('Basic implementation')).toBe('simple');
        expect(detectComplexity('Just a test endpoint')).toBe('simple');
      });

      test('should detect multiple simple indicators', () => {
        expect(detectComplexity('Create simple basic prototype')).toBe('simple');
        expect(detectComplexity('Quick and minimal demo implementation')).toBe('simple');
      });

      test('should be case insensitive', () => {
        expect(detectComplexity('CREATE SIMPLE API')).toBe('simple');
        expect(detectComplexity('QuIcK pRoToTyPe')).toBe('simple');
      });
    });

    describe('Ultra Think Detection', () => {
      test('should detect single ultra indicators', () => {
        expect(detectThinkingLevel('Production ready system')).toBe('ultra');
        expect(detectThinkingLevel('Enterprise grade application')).toBe('ultra');
        expect(detectThinkingLevel('Scalable microservice')).toBe('ultra');
        expect(detectThinkingLevel('Secure authentication system')).toBe('ultra');
      });

      test('should detect ultra phrases', () => {
        expect(detectThinkingLevel('Implement zero downtime deployment')).toBe('ultra');
        expect(detectThinkingLevel('Need high performance solution')).toBe('ultra');
        expect(detectThinkingLevel('Build large scale system')).toBe('ultra');
        expect(detectThinkingLevel('Create enterprise grade platform')).toBe('ultra');
      });

      test('should prioritize ultra phrases over single indicators', () => {
        expect(detectThinkingLevel('Simple production ready system')).toBe('ultra');
        expect(detectThinkingLevel('Basic enterprise grade solution')).toBe('ultra');
      });

      test('should detect multiple ultra indicators', () => {
        expect(detectThinkingLevel('Production scalable secure system')).toBe('ultra');
        expect(detectThinkingLevel('Enterprise monitoring and authentication')).toBe('ultra');
      });
    });

    describe('Standard Think Detection', () => {
      test('should default to standard for neutral descriptions', () => {
        expect(detectThinkingLevel('Create user registration system')).toBe('standard');
        expect(detectThinkingLevel('Add email notification feature')).toBe('standard');
        expect(detectThinkingLevel('Implement shopping cart')).toBe('standard');
      });

      test('should choose standard over single light indicator when confidence is low', () => {
        expect(detectThinkingLevel('Create comprehensive simple system')).toBe('standard');
      });
    });

    describe('Mixed Indicators', () => {
      test('should prioritize ultra over light', () => {
        expect(detectThinkingLevel('Simple production system')).toBe('ultra');
        expect(detectThinkingLevel('Basic enterprise solution')).toBe('ultra');
      });

      test('should handle conflicting indicators appropriately', () => {
        // Ultra phrases should win
        expect(detectThinkingLevel('Quick production ready system')).toBe('ultra');
        // Multiple ultra indicators should win
        expect(detectThinkingLevel('Simple scalable secure system')).toBe('ultra');
      });
    });
  });

  describe('analyzeComplexity', () => {
    test('should provide detailed analysis for light indicators', () => {
      const analysis = analyzeComplexity('Create simple basic API');

      expect(analysis.thinkingLevel).toBe('light');
      expect(analysis.confidence).toBeGreaterThan(0.7);
      expect(analysis.indicators).toContain('simple');
      expect(analysis.indicators).toContain('basic');
      expect(analysis.reasoning).toContain('Multiple indicators');
    });

    test('should provide detailed analysis for ultra phrases', () => {
      const analysis = analyzeComplexity('Implement zero downtime deployment');

      expect(analysis.thinkingLevel).toBe('ultra');
      expect(analysis.confidence).toBe(0.9);
      expect(analysis.indicators).toContain('zero downtime');
      expect(analysis.reasoning).toContain('production/enterprise');
    });

    test('should provide detailed analysis for single indicators', () => {
      const analysis = analyzeComplexity('Create scalable system');

      expect(analysis.thinkingLevel).toBe('ultra');
      expect(analysis.confidence).toBe(0.7);
      expect(analysis.indicators).toContain('scalable');
      expect(analysis.reasoning).toContain('Production/enterprise keyword');
    });

    test('should provide analysis for standard cases', () => {
      const analysis = analyzeComplexity('Create user management system');

      expect(analysis.thinkingLevel).toBe('standard');
      expect(analysis.confidence).toBe(0.5);
      expect(analysis.indicators).toHaveLength(0);
      expect(analysis.reasoning).toContain('No clear complexity indicators');
    });

    test('should handle mixed indicators with reasoning', () => {
      const analysis = analyzeComplexity('Quick production system');

      expect(analysis.thinkingLevel).toBe('ultra');
      expect(analysis.confidence).toBeGreaterThan(0.5);
      expect(analysis.reasoning).toBeDefined();
    });
  });

  describe('getAgentSuffix', () => {
    test('should return correct suffixes for each thinking level', () => {
      expect(getAgentSuffix('light')).toBe('simple');
      expect(getAgentSuffix('standard')).toBe('moderate');
      expect(getAgentSuffix('ultra')).toBe('complex');
    });

    test('should default to moderate for unknown levels', () => {
      expect(getAgentSuffix('unknown' as ThinkingLevel)).toBe('moderate');
    });
  });

  describe('getThinkingLevelDescription', () => {
    test('should return correct descriptions for each thinking level', () => {
      expect(getThinkingLevelDescription('light')).toContain('Light Think');
      expect(getThinkingLevelDescription('standard')).toContain('Standard Think');
      expect(getThinkingLevelDescription('ultra')).toContain('Ultra Think');
    });

    test('should return unknown message for invalid levels', () => {
      expect(getThinkingLevelDescription('invalid' as ThinkingLevel)).toContain('Unknown');
    });
  });

  describe('Real-world Examples', () => {
    test('should correctly classify common development tasks', () => {
      // Light examples
      expect(detectThinkingLevel('Add dummy data to controller')).toBe('light');
      expect(detectThinkingLevel('Create mock API endpoint')).toBe('light');
      expect(detectThinkingLevel('Quick test implementation')).toBe('light');

      // Standard examples
      expect(detectThinkingLevel('Implement user authentication')).toBe('standard');
      expect(detectThinkingLevel('Add email notifications')).toBe('standard');
      expect(detectThinkingLevel('Create product catalog')).toBe('standard');

      // Ultra examples
      expect(detectThinkingLevel('Design production-ready payment system')).toBe('ultra');
      expect(detectThinkingLevel('Implement enterprise authentication with SSO')).toBe('ultra');
      expect(detectThinkingLevel('Build scalable microservice architecture')).toBe('ultra');
    });

    test('should handle domain-specific terminology', () => {
      // DevOps/Infrastructure
      expect(detectThinkingLevel('Setup monitoring and alerting')).toBe('ultra');
      expect(detectThinkingLevel('Implement disaster recovery')).toBe('ultra');

      // Security
      expect(detectThinkingLevel('Add encryption for sensitive data')).toBe('ultra');
      expect(detectThinkingLevel('Implement security hardening')).toBe('ultra');

      // Performance
      expect(detectThinkingLevel('Optimize for high performance')).toBe('ultra');
      expect(detectThinkingLevel('Design for large scale')).toBe('ultra');
    });

    test('should handle edge cases gracefully', () => {
      expect(detectThinkingLevel('')).toBe('standard');
      expect(detectThinkingLevel('   ')).toBe('standard');
      expect(detectThinkingLevel('a')).toBe('standard');
    });
  });

  describe('Confidence Scoring', () => {
    test('should assign higher confidence for multiple indicators', () => {
      const singleIndicator = analyzeComplexity('Create simple API');
      const multipleIndicators = analyzeComplexity('Create simple basic minimal API');

      expect(multipleIndicators.confidence).toBeGreaterThan(singleIndicator.confidence);
    });

    test('should assign highest confidence for ultra phrases', () => {
      const phraseAnalysis = analyzeComplexity('Implement zero downtime deployment');
      const indicatorAnalysis = analyzeComplexity('Create scalable system');

      expect(phraseAnalysis.confidence).toBeGreaterThan(indicatorAnalysis.confidence);
      expect(phraseAnalysis.confidence).toBe(0.9);
    });

    test('should assign medium confidence for single indicators', () => {
      const lightSingle = analyzeComplexity('Create simple API');
      const ultraSingle = analyzeComplexity('Create scalable system');

      expect(lightSingle.confidence).toBeGreaterThanOrEqual(0.6);
      expect(ultraSingle.confidence).toBe(0.7);
    });

    test('should assign lowest confidence for default cases', () => {
      const defaultCase = analyzeComplexity('Create user system');
      expect(defaultCase.confidence).toBe(0.5);
    });
  });

  describe('Performance Considerations', () => {
    test('should handle long task descriptions efficiently', () => {
      const longDescription = 'Create a comprehensive user management system with authentication, authorization, role-based access control, user profiles, settings, notifications, and integration with external services for a large enterprise application that needs to be production ready and scalable';

      const start = performance.now();
      const result = detectThinkingLevel(longDescription);
      const end = performance.now();

      expect(result).toBe('ultra');
      expect(end - start).toBeLessThan(10); // Should complete in under 10ms
    });

    test('should handle repeated calls efficiently', () => {
      const description = 'Create production ready system';

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        detectThinkingLevel(description);
      }
      const end = performance.now();

      expect(end - start).toBeLessThan(100); // 100 calls in under 100ms
    });
  });

  describe('Type Safety', () => {
    test('should return valid ThinkingLevel types', () => {
      const validLevels: ThinkingLevel[] = ['light', 'standard', 'ultra'];

      const testCases = [
        'simple test',
        'normal feature',
        'production system'
      ];

      testCases.forEach(testCase => {
        const result = detectThinkingLevel(testCase);
        expect(validLevels).toContain(result);
      });
    });

    test('should return valid ComplexityAnalysis structure', () => {
      const analysis = analyzeComplexity('test task');

      expect(analysis).toHaveProperty('thinkingLevel');
      expect(analysis).toHaveProperty('confidence');
      expect(analysis).toHaveProperty('indicators');
      expect(analysis).toHaveProperty('reasoning');

      expect(typeof analysis.thinkingLevel).toBe('string');
      expect(typeof analysis.confidence).toBe('number');
      expect(Array.isArray(analysis.indicators)).toBe(true);
      expect(typeof analysis.reasoning).toBe('string');

      expect(analysis.confidence).toBeGreaterThanOrEqual(0);
      expect(analysis.confidence).toBeLessThanOrEqual(1);
    });
  });
});