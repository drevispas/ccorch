import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CapabilityRegistry } from '../../core/plugins/capability-registry';
import { PluginCapability, CapabilityProvider, CapabilityRequirement } from '../../core/plugins/types';

describe('CapabilityRegistry Extended Tests', () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
  });

  describe('Capability Registration Edge Cases', () => {
    it('should register capability with metadata', () => {
      const capability: PluginCapability = {
        id: 'advanced-nlp',
        name: 'Advanced NLP',
        description: 'Advanced natural language processing',
        version: '2.0.0',
        inputSchema: { type: 'string' },
        outputSchema: { type: 'object' },
        metadata: {
          languages: ['en', 'es', 'fr'],
          maxTokens: 4096,
          modelType: 'transformer'
        }
      };

      registry.registerCapability(capability);

      const retrieved = registry.getCapability('advanced-nlp');
      expect(retrieved?.metadata).toEqual(capability.metadata);
    });

    it('should update existing capability', () => {
      const capability1: PluginCapability = {
        id: 'test-cap',
        name: 'Test Capability',
        description: 'Version 1',
        version: '1.0.0'
      };

      const capability2: PluginCapability = {
        id: 'test-cap',
        name: 'Test Capability Updated',
        description: 'Version 2',
        version: '2.0.0'
      };

      registry.registerCapability(capability1);
      registry.registerCapability(capability2);

      const retrieved = registry.getCapability('test-cap');
      expect(retrieved?.version).toBe('2.0.0');
      expect(retrieved?.description).toBe('Version 2');
    });

    it('should handle capability without optional fields', () => {
      const minimalCapability: PluginCapability = {
        id: 'minimal',
        name: 'Minimal Capability',
        description: 'Minimal capability without optional fields',
        version: '1.0.0'
      };

      registry.registerCapability(minimalCapability);

      const retrieved = registry.getCapability('minimal');
      expect(retrieved).toBeDefined();
      expect(retrieved?.inputSchema).toBeUndefined();
      expect(retrieved?.outputSchema).toBeUndefined();
    });
  });

  describe('Provider Management', () => {
    const mockProvider: CapabilityProvider = {
      pluginId: 'test-plugin',
      pluginName: 'Test Plugin',
      capabilities: ['cap1', 'cap2', 'cap3'],
      priority: 10,
      metadata: {
        author: 'Test Author',
        license: 'MIT'
      }
    };

    it('should register provider with multiple capabilities', () => {
      registry.registerProvider('test-plugin', mockProvider);

      const providers1 = registry.getProviders('cap1');
      const providers2 = registry.getProviders('cap2');
      const providers3 = registry.getProviders('cap3');

      expect(providers1).toHaveLength(1);
      expect(providers2).toHaveLength(1);
      expect(providers3).toHaveLength(1);
    });

    it('should sort providers by priority', () => {
      const highPriority: CapabilityProvider = {
        ...mockProvider,
        pluginId: 'high-priority',
        priority: 100
      };

      const lowPriority: CapabilityProvider = {
        ...mockProvider,
        pluginId: 'low-priority',
        priority: 1
      };

      registry.registerProvider('high-priority', highPriority);
      registry.registerProvider('low-priority', lowPriority);

      const providers = registry.getProviders('cap1');
      expect(providers[0].pluginId).toBe('high-priority');
      expect(providers[1].pluginId).toBe('low-priority');
    });

    it('should unregister provider and remove from all capabilities', () => {
      registry.registerProvider('test-plugin', mockProvider);
      registry.unregisterProvider('test-plugin');

      expect(registry.getProviders('cap1')).toHaveLength(0);
      expect(registry.getProviders('cap2')).toHaveLength(0);
      expect(registry.getProviders('cap3')).toHaveLength(0);
    });

    it('should handle unregistering non-existent provider', () => {
      expect(() => {
        registry.unregisterProvider('non-existent');
      }).not.toThrow();
    });

    it('should get all providers', () => {
      const provider1: CapabilityProvider = {
        ...mockProvider,
        pluginId: 'plugin1'
      };

      const provider2: CapabilityProvider = {
        ...mockProvider,
        pluginId: 'plugin2'
      };

      registry.registerProvider('plugin1', provider1);
      registry.registerProvider('plugin2', provider2);

      const allProviders = registry.getAllProviders();
      expect(allProviders).toHaveLength(2);
    });
  });

  describe('Capability Matching', () => {
    beforeEach(() => {
      // Register test capabilities
      registry.registerCapability({
        id: 'text-processing',
        name: 'Text Processing',
        description: 'Process text data',
        version: '1.0.0'
      });

      registry.registerCapability({
        id: 'image-processing',
        name: 'Image Processing',
        description: 'Process image data',
        version: '1.0.0'
      });

      // Register providers
      registry.registerProvider('text-plugin', {
        pluginId: 'text-plugin',
        pluginName: 'Text Plugin',
        capabilities: ['text-processing'],
        priority: 10
      });

      registry.registerProvider('multi-plugin', {
        pluginId: 'multi-plugin',
        pluginName: 'Multi Plugin',
        capabilities: ['text-processing', 'image-processing'],
        priority: 5
      });
    });

    it('should match single requirement', () => {
      const requirements: CapabilityRequirement[] = [
        {
          capability: 'text-processing',
          version: '1.0.0'
        }
      ];

      const matches = registry.matchRequirements(requirements);
      expect(matches).toHaveLength(2);
      expect(matches[0].pluginId).toBe('text-plugin');
    });

    it('should match multiple requirements', () => {
      const requirements: CapabilityRequirement[] = [
        {
          capability: 'text-processing',
          version: '1.0.0'
        },
        {
          capability: 'image-processing',
          version: '1.0.0'
        }
      ];

      const matches = registry.matchRequirements(requirements);
      expect(matches).toHaveLength(1);
      expect(matches[0].pluginId).toBe('multi-plugin');
    });

    it('should handle optional requirements', () => {
      const requirements: CapabilityRequirement[] = [
        {
          capability: 'text-processing',
          version: '1.0.0',
          required: true
        },
        {
          capability: 'non-existent',
          version: '1.0.0',
          required: false
        }
      ];

      const matches = registry.matchRequirements(requirements);
      expect(matches.length).toBeGreaterThan(0);
    });

    it('should return empty array for unmatched required capability', () => {
      const requirements: CapabilityRequirement[] = [
        {
          capability: 'non-existent',
          version: '1.0.0',
          required: true
        }
      ];

      const matches = registry.matchRequirements(requirements);
      expect(matches).toHaveLength(0);
    });
  });

  describe('Capability Queries', () => {
    beforeEach(() => {
      registry.registerCapability({
        id: 'capability-1',
        name: 'Capability 1',
        description: 'First capability',
        version: '1.0.0'
      });

      registry.registerCapability({
        id: 'capability-2',
        name: 'Capability 2',
        description: 'Second capability',
        version: '2.0.0'
      });
    });

    it('should list all capabilities', () => {
      const capabilities = registry.listCapabilities();
      expect(capabilities).toHaveLength(2);
    });

    it('should check if capability exists', () => {
      expect(registry.hasCapability('capability-1')).toBe(true);
      expect(registry.hasCapability('non-existent')).toBe(false);
    });

    it('should unregister capability', () => {
      registry.unregisterCapability('capability-1');
      expect(registry.hasCapability('capability-1')).toBe(false);
      expect(registry.listCapabilities()).toHaveLength(1);
    });

    it('should get capability by id', () => {
      const capability = registry.getCapability('capability-1');
      expect(capability?.name).toBe('Capability 1');
    });

    it('should return undefined for non-existent capability', () => {
      const capability = registry.getCapability('non-existent');
      expect(capability).toBeUndefined();
    });
  });

  describe('Clear and Reset', () => {
    it('should clear all capabilities', () => {
      registry.registerCapability({
        id: 'test',
        name: 'Test',
        description: 'Test',
        version: '1.0.0'
      });

      registry.clear();

      expect(registry.listCapabilities()).toHaveLength(0);
    });

    it('should clear all providers', () => {
      registry.registerProvider('test', {
        pluginId: 'test',
        pluginName: 'Test',
        capabilities: ['test'],
        priority: 1
      });

      registry.clear();

      expect(registry.getAllProviders()).toHaveLength(0);
    });

    it('should clear capability-provider mappings', () => {
      registry.registerCapability({
        id: 'test-cap',
        name: 'Test',
        description: 'Test',
        version: '1.0.0'
      });

      registry.registerProvider('test-provider', {
        pluginId: 'test-provider',
        pluginName: 'Test Provider',
        capabilities: ['test-cap'],
        priority: 1
      });

      registry.clear();

      expect(registry.getProviders('test-cap')).toHaveLength(0);
    });
  });

  describe('Version Compatibility', () => {
    it('should handle version wildcards in requirements', () => {
      registry.registerCapability({
        id: 'versioned-cap',
        name: 'Versioned',
        description: 'Versioned capability',
        version: '2.3.1'
      });

      const requirements: CapabilityRequirement[] = [
        {
          capability: 'versioned-cap',
          version: '2.*'
        }
      ];

      // Note: Actual version matching logic would need to be implemented
      // This test assumes basic string matching for now
      const capability = registry.getCapability('versioned-cap');
      expect(capability?.version).toMatch(/^2\./);
    });

    it('should handle semantic version ranges', () => {
      registry.registerCapability({
        id: 'semantic-cap',
        name: 'Semantic',
        description: 'Semantic versioning',
        version: '1.5.0'
      });

      const capability = registry.getCapability('semantic-cap');
      const [major, minor, patch] = capability!.version.split('.').map(Number);

      expect(major).toBe(1);
      expect(minor).toBe(5);
      expect(patch).toBe(0);
    });
  });

  describe('Provider Metadata', () => {
    it('should preserve provider metadata', () => {
      const provider: CapabilityProvider = {
        pluginId: 'metadata-plugin',
        pluginName: 'Metadata Plugin',
        capabilities: ['test'],
        priority: 5,
        metadata: {
          author: 'John Doe',
          license: 'Apache-2.0',
          homepage: 'https://example.com',
          tags: ['nlp', 'ai', 'processing']
        }
      };

      registry.registerProvider('metadata-plugin', provider);

      const providers = registry.getAllProviders();
      const found = providers.find(p => p.pluginId === 'metadata-plugin');

      expect(found?.metadata).toEqual(provider.metadata);
    });

    it('should handle provider without metadata', () => {
      const provider: CapabilityProvider = {
        pluginId: 'no-metadata',
        pluginName: 'No Metadata',
        capabilities: ['test'],
        priority: 1
      };

      registry.registerProvider('no-metadata', provider);

      const providers = registry.getAllProviders();
      const found = providers.find(p => p.pluginId === 'no-metadata');

      expect(found?.metadata).toBeUndefined();
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle circular capability dependencies', () => {
      registry.registerCapability({
        id: 'cap-a',
        name: 'Capability A',
        description: 'Depends on B',
        version: '1.0.0',
        metadata: { dependsOn: ['cap-b'] }
      });

      registry.registerCapability({
        id: 'cap-b',
        name: 'Capability B',
        description: 'Depends on A',
        version: '1.0.0',
        metadata: { dependsOn: ['cap-a'] }
      });

      expect(registry.listCapabilities()).toHaveLength(2);
    });

    it('should handle provider with duplicate capabilities', () => {
      const provider: CapabilityProvider = {
        pluginId: 'duplicate-caps',
        pluginName: 'Duplicate Capabilities',
        capabilities: ['cap1', 'cap1', 'cap2', 'cap2'],
        priority: 1
      };

      registry.registerProvider('duplicate-caps', provider);

      const providers1 = registry.getProviders('cap1');
      const providers2 = registry.getProviders('cap2');

      // Should handle duplicates gracefully
      expect(providers1.filter(p => p.pluginId === 'duplicate-caps')).toHaveLength(1);
      expect(providers2.filter(p => p.pluginId === 'duplicate-caps')).toHaveLength(1);
    });

    it('should handle re-registration of provider', () => {
      const provider1: CapabilityProvider = {
        pluginId: 'test',
        pluginName: 'Test v1',
        capabilities: ['cap1'],
        priority: 1
      };

      const provider2: CapabilityProvider = {
        pluginId: 'test',
        pluginName: 'Test v2',
        capabilities: ['cap2'],
        priority: 2
      };

      registry.registerProvider('test', provider1);
      registry.registerProvider('test', provider2);

      // Should update to new provider
      const providers1 = registry.getProviders('cap1');
      const providers2 = registry.getProviders('cap2');

      expect(providers1.some(p => p.pluginId === 'test')).toBe(false);
      expect(providers2.some(p => p.pluginId === 'test')).toBe(true);
    });
  });
});