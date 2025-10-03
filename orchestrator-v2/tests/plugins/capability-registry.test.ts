import { describe, it, expect, beforeEach } from '@jest/globals';
import { CapabilityRegistry } from '../../core/plugins/capability-registry';
import {
  AgentCapability,
  CapabilityQuery,
  PluginManifest,
  ComplexityLevel
} from '../../core/plugins/types';

describe('CapabilityRegistry', () => {
  let registry: CapabilityRegistry;

  const mockCapability1: AgentCapability = {
    id: 'backend-architect',
    name: 'Backend Architecture',
    description: 'Design backend systems',
    tags: ['backend', 'architecture', 'design'],
    requiredPermissions: ['code:write'],
    optionalPermissions: ['code:review'],
    inputSchema: {
      type: 'object',
      properties: {
        requirements: { type: 'string' }
      }
    },
    outputSchema: {
      type: 'object',
      properties: {
        design: { type: 'string' }
      }
    },
    complexity: 'moderate' as ComplexityLevel,
    estimatedDuration: 300,
    keywords: ['api', 'database', 'microservices']
  };

  const mockCapability2: AgentCapability = {
    id: 'code-reviewer',
    name: 'Code Review',
    description: 'Review code for quality',
    tags: ['review', 'quality', 'testing'],
    requiredPermissions: ['code:read'],
    optionalPermissions: ['code:comment'],
    complexity: 'simple' as ComplexityLevel,
    estimatedDuration: 120,
    keywords: ['lint', 'test', 'quality']
  };

  const mockCapability3: AgentCapability = {
    id: 'test-architect',
    name: 'Test Architecture',
    description: 'Design test strategies',
    tags: ['testing', 'e2e', 'architecture'],
    requiredPermissions: ['code:write', 'test:execute'],
    complexity: 'complex' as ComplexityLevel,
    estimatedDuration: 600,
    keywords: ['e2e', 'integration', 'unit']
  };

  beforeEach(() => {
    registry = new CapabilityRegistry();
  });

  describe('registerCapability', () => {
    it('should register a capability successfully', () => {
      registry.registerCapability('plugin1', mockCapability1);

      const capabilities = registry.getCapabilitiesByPlugin('plugin1');
      expect(capabilities).toHaveLength(1);
      expect(capabilities[0]).toEqual(mockCapability1);
    });

    it('should register multiple capabilities for same plugin', () => {
      registry.registerCapability('plugin1', mockCapability1);
      registry.registerCapability('plugin1', mockCapability2);

      const capabilities = registry.getCapabilitiesByPlugin('plugin1');
      expect(capabilities).toHaveLength(2);
    });

    it('should not register duplicate capabilities', () => {
      registry.registerCapability('plugin1', mockCapability1);
      registry.registerCapability('plugin1', mockCapability1);

      const capabilities = registry.getCapabilitiesByPlugin('plugin1');
      expect(capabilities).toHaveLength(1);
    });

    it('should index capabilities by tags', () => {
      registry.registerCapability('plugin1', mockCapability1);

      const byTag = registry.findCapabilitiesByTag('backend');
      expect(byTag).toHaveLength(1);
      expect(byTag[0].id).toBe('backend-architect');
    });
  });

  describe('findCapabilities', () => {
    beforeEach(() => {
      registry.registerCapability('plugin1', mockCapability1);
      registry.registerCapability('plugin2', mockCapability2);
      registry.registerCapability('plugin3', mockCapability3);
    });

    it('should find capabilities by tags', () => {
      const query: CapabilityQuery = {
        tags: ['architecture']
      };

      const results = registry.findCapabilities(query);
      expect(results).toHaveLength(2);
      expect(results.map(r => r.capability.id)).toContain('backend-architect');
      expect(results.map(r => r.capability.id)).toContain('test-architect');
    });

    it('should find capabilities by required permissions', () => {
      const query: CapabilityQuery = {
        requiredPermissions: ['code:write']
      };

      const results = registry.findCapabilities(query);
      expect(results).toHaveLength(2);
      expect(results.map(r => r.capability.id)).toContain('backend-architect');
      expect(results.map(r => r.capability.id)).toContain('test-architect');
    });

    it('should find capabilities by complexity level', () => {
      const query: CapabilityQuery = {
        complexity: 'simple'
      };

      const results = registry.findCapabilities(query);
      expect(results).toHaveLength(1);
      expect(results[0].capability.id).toBe('code-reviewer');
    });

    it('should find capabilities by keywords', () => {
      const query: CapabilityQuery = {
        keywords: ['database']
      };

      const results = registry.findCapabilities(query);
      expect(results).toHaveLength(1);
      expect(results[0].capability.id).toBe('backend-architect');
    });

    it('should combine multiple query criteria', () => {
      const query: CapabilityQuery = {
        tags: ['testing'],
        complexity: 'complex'
      };

      const results = registry.findCapabilities(query);
      expect(results).toHaveLength(1);
      expect(results[0].capability.id).toBe('test-architect');
    });

    it('should calculate relevance scores', () => {
      const query: CapabilityQuery = {
        tags: ['backend', 'architecture'],
        keywords: ['api']
      };

      const results = registry.findCapabilities(query);
      expect(results[0].capability.id).toBe('backend-architect');
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('should sort results by score', () => {
      const query: CapabilityQuery = {
        tags: ['architecture', 'testing']
      };

      const results = registry.findCapabilities(query);
      expect(results.length).toBeGreaterThan(1);

      // Check that results are sorted by score (descending)
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }
    });
  });

  describe('getBestMatch', () => {
    beforeEach(() => {
      registry.registerCapability('plugin1', mockCapability1);
      registry.registerCapability('plugin2', mockCapability2);
      registry.registerCapability('plugin3', mockCapability3);
    });

    it('should return the best matching capability', () => {
      const query: CapabilityQuery = {
        tags: ['backend', 'architecture'],
        keywords: ['api', 'microservices']
      };

      const result = registry.getBestMatch(query);
      expect(result).toBeDefined();
      expect(result?.capability.id).toBe('backend-architect');
    });

    it('should return null if no matches found', () => {
      const query: CapabilityQuery = {
        tags: ['frontend', 'react']
      };

      const result = registry.getBestMatch(query);
      expect(result).toBeNull();
    });

    it('should respect minimum score threshold', () => {
      const query: CapabilityQuery = {
        tags: ['unrelated-tag']
      };

      const result = registry.getBestMatch(query, 0.5);
      expect(result).toBeNull();
    });
  });

  describe('getCompatibilityMatrix', () => {
    beforeEach(() => {
      registry.registerCapability('plugin1', mockCapability1);
      registry.registerCapability('plugin2', mockCapability2);
      registry.registerCapability('plugin3', mockCapability3);
    });

    it('should generate compatibility matrix', () => {
      const matrix = registry.getCompatibilityMatrix();

      expect(matrix).toHaveProperty('backend-architect');
      expect(matrix).toHaveProperty('code-reviewer');
      expect(matrix).toHaveProperty('test-architect');

      // Backend architect and code reviewer should be compatible (shared permission)
      expect(matrix['backend-architect']).toContain('code-reviewer');
    });

    it('should identify compatible capabilities based on permissions', () => {
      const matrix = registry.getCompatibilityMatrix();

      // Test architect requires code:write, backend architect provides it
      expect(matrix['backend-architect']).toContain('test-architect');
    });
  });

  describe('removeCapability', () => {
    it('should remove a capability', () => {
      registry.registerCapability('plugin1', mockCapability1);
      registry.registerCapability('plugin1', mockCapability2);

      registry.removeCapability('plugin1', 'backend-architect');

      const capabilities = registry.getCapabilitiesByPlugin('plugin1');
      expect(capabilities).toHaveLength(1);
      expect(capabilities[0].id).toBe('code-reviewer');
    });

    it('should clean up indexes when removing capability', () => {
      registry.registerCapability('plugin1', mockCapability1);

      registry.removeCapability('plugin1', 'backend-architect');

      const byTag = registry.findCapabilitiesByTag('backend');
      expect(byTag).toHaveLength(0);
    });
  });

  describe('clearPlugin', () => {
    it('should remove all capabilities for a plugin', () => {
      registry.registerCapability('plugin1', mockCapability1);
      registry.registerCapability('plugin1', mockCapability2);
      registry.registerCapability('plugin2', mockCapability3);

      registry.clearPlugin('plugin1');

      expect(registry.getCapabilitiesByPlugin('plugin1')).toHaveLength(0);
      expect(registry.getCapabilitiesByPlugin('plugin2')).toHaveLength(1);
    });
  });

  describe('getAllCapabilities', () => {
    it('should return all registered capabilities', () => {
      registry.registerCapability('plugin1', mockCapability1);
      registry.registerCapability('plugin2', mockCapability2);
      registry.registerCapability('plugin3', mockCapability3);

      const all = registry.getAllCapabilities();
      expect(all).toHaveLength(3);
      expect(all.map(c => c.id)).toContain('backend-architect');
      expect(all.map(c => c.id)).toContain('code-reviewer');
      expect(all.map(c => c.id)).toContain('test-architect');
    });
  });

  describe('findCapabilitiesByTag', () => {
    it('should find capabilities with specific tag', () => {
      registry.registerCapability('plugin1', mockCapability1);
      registry.registerCapability('plugin2', mockCapability2);
      registry.registerCapability('plugin3', mockCapability3);

      const results = registry.findCapabilitiesByTag('testing');
      expect(results).toHaveLength(2);
      expect(results.map(c => c.id)).toContain('code-reviewer');
      expect(results.map(c => c.id)).toContain('test-architect');
    });
  });

  describe('getCapabilityById', () => {
    it('should return capability by id', () => {
      registry.registerCapability('plugin1', mockCapability1);

      const capability = registry.getCapabilityById('backend-architect');
      expect(capability).toEqual(mockCapability1);
    });

    it('should return undefined for non-existent id', () => {
      const capability = registry.getCapabilityById('non-existent');
      expect(capability).toBeUndefined();
    });
  });
});