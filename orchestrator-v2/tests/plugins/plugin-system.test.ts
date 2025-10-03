import { describe, it, expect, beforeEach } from '@jest/globals';
import { CapabilityRegistry } from '../../core/plugins/capability-registry';
import { PluginLoader } from '../../core/plugins/plugin-loader';
import { VersionManager } from '../../core/plugins/version-manager';
import { AgentManager } from '../../core/plugins/agent-manager';
import { BasePlugin, SimplePlugin } from '../../core/plugins/base-plugin';
import {
  AgentCapability,
  PluginManifest,
  ComplexityLevel
} from '../../core/plugins/types';

describe('Plugin System Integration Tests', () => {
  describe('CapabilityRegistry', () => {
    let registry: CapabilityRegistry;

    beforeEach(() => {
      registry = new CapabilityRegistry();
    });

    it('should register and retrieve capabilities', () => {
      const capability: AgentCapability = {
        id: 'test-cap',
        name: 'Test Capability',
        description: 'Test description',
        tags: ['test'],
        requiredPermissions: [],
        complexity: 'simple' as ComplexityLevel,
        estimatedDuration: 100,
        keywords: ['test']
      };

      registry.register(capability, 'plugin1');

      const retrieved = registry.get('test-cap');
      expect(retrieved).toEqual(capability);
      expect(registry.has('test-cap')).toBe(true);
    });

    it('should search capabilities by tags', () => {
      const cap1: AgentCapability = {
        id: 'cap1',
        name: 'Capability 1',
        description: 'Description 1',
        tags: ['backend', 'api'],
        requiredPermissions: [],
        complexity: 'moderate' as ComplexityLevel,
        estimatedDuration: 200,
        keywords: ['rest', 'api']
      };

      const cap2: AgentCapability = {
        id: 'cap2',
        name: 'Capability 2',
        description: 'Description 2',
        tags: ['frontend', 'ui'],
        requiredPermissions: [],
        complexity: 'simple' as ComplexityLevel,
        estimatedDuration: 100,
        keywords: ['react', 'ui']
      };

      registry.register(cap1);
      registry.register(cap2);

      const results = registry.search({ tags: ['backend'] });
      expect(results.length).toBe(1);
      expect(results[0].capability.id).toBe('cap1');
    });
  });

  describe('VersionManager', () => {
    let versionManager: VersionManager;

    beforeEach(() => {
      versionManager = new VersionManager();
    });

    it('should manage plugin versions', () => {
      versionManager.setVersion('plugin1', '1.0.0');
      expect(versionManager.getVersion('plugin1')).toBe('1.0.0');

      const isCompatible = versionManager.checkCompatibility('plugin1', '>=1.0.0');
      expect(isCompatible).toBe(true);

      const notCompatible = versionManager.checkCompatibility('plugin1', '>=2.0.0');
      expect(notCompatible).toBe(false);
    });

    it('should check dependencies', () => {
      versionManager.setVersion('dep1', '1.5.0');
      versionManager.setVersion('dep2', '2.0.0');

      versionManager.addDependency('plugin1', {
        name: 'dep1',
        version: '>=1.0.0'
      });

      versionManager.addDependency('plugin1', {
        name: 'dep2',
        version: '>=2.0.0'
      });

      const result = versionManager.checkDependencies('plugin1');
      expect(result.satisfied).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.incompatible).toEqual([]);
    });
  });

  describe('BasePlugin', () => {
    it('should create and initialize a simple plugin', async () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        author: 'Test Author',
        description: 'Test plugin',
        capabilities: []
      };

      const plugin = new SimplePlugin(manifest, async (params) => {
        return { success: true, result: params.value * 2 };
      });

      await plugin.initialize();
      expect(plugin.isInitialized).toBe(true);

      const result = await plugin.execute({ value: 5 });
      expect(result.success).toBe(true);
      expect(result.result).toBe(10);

      await plugin.destroy();
      expect(plugin.isInitialized).toBe(false);
    });
  });

  describe('AgentManager', () => {
    let agentManager: AgentManager;

    beforeEach(() => {
      agentManager = new AgentManager({
        autoRegisterCapabilities: true
      });
    });

    it('should load and execute plugins', async () => {
      const manifest: PluginManifest = {
        id: 'math-plugin',
        name: 'Math Plugin',
        version: '1.0.0',
        author: 'Test',
        description: 'Math operations',
        capabilities: [{
          id: 'multiply',
          name: 'Multiply',
          description: 'Multiply two numbers',
          tags: ['math'],
          requiredPermissions: [],
          complexity: 'simple' as ComplexityLevel,
          estimatedDuration: 10,
          keywords: ['multiply', 'math']
        }]
      };

      const plugin = new SimplePlugin(manifest, async (params) => {
        return { result: params.a * params.b };
      });

      await plugin.initialize();
      const loadResult = await agentManager.loadPlugin('math-plugin', plugin);
      expect(loadResult.success).toBe(true);

      const execResult = await agentManager.execute({
        pluginId: 'math-plugin',
        params: { a: 3, b: 4 }
      });

      expect(execResult.success).toBe(true);
      expect(execResult.data.result).toBe(12);
    });

    it('should find best plugin for task', async () => {
      const manifest: PluginManifest = {
        id: 'code-plugin',
        name: 'Code Plugin',
        version: '1.0.0',
        author: 'Test',
        description: 'Code operations',
        capabilities: [{
          id: 'review',
          name: 'Code Review',
          description: 'Review code',
          tags: ['review', 'code'],
          requiredPermissions: [],
          complexity: 'moderate' as ComplexityLevel,
          estimatedDuration: 300,
          keywords: ['review', 'code', 'quality']
        }]
      };

      const plugin = new SimplePlugin(manifest);
      await plugin.initialize();
      await agentManager.loadPlugin('code-plugin', plugin);

      const best = agentManager.selectBestPlugin('review code quality', 'moderate');
      expect(best).not.toBeNull();
      expect(best?.pluginId).toBe('code-plugin');
      expect(best?.capability.id).toBe('review');
    });
  });
});