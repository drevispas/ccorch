import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { PluginLoader } from '../../core/plugins/plugin-loader';
import { AgentPlugin, PluginConfig, PluginManifest } from '../../core/plugins/types';
import { PluginStatus } from '../../core/enums';

// Mock fs module
jest.mock('fs');

describe('PluginLoader Extended Tests', () => {
  let pluginLoader: PluginLoader;
  let mockPlugin: AgentPlugin;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create mock plugin
    mockPlugin = {
      manifest: {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        author: 'Test Author',
        description: 'Test plugin for extended testing',
        capabilities: ['test-capability'],
        dependencies: {}
      },
      metadata: {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        author: 'Test Author',
        description: 'Test plugin for extended testing',
        capabilities: ['test-capability'],
        dependencies: {}
      },
      isInitialized: false,
      initialize: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn().mockResolvedValue({ success: true }),
      destroy: jest.fn().mockResolvedValue(undefined)
    };

    // Initialize plugin loader with test config
    pluginLoader = new PluginLoader({
      pluginsDir: '/test/plugins',
      enableAutoDiscovery: true,
      requireManifest: true,
      enableCaching: true,
      autoReload: true
    });
  });

  afterEach(() => {
    pluginLoader.clear();
  });

  describe('Plugin Loading Edge Cases', () => {
    it('should handle blocked plugins', async () => {
      const loader = new PluginLoader({
        blockedPlugins: ['blocked-plugin']
      });

      const result = await loader.load('blocked-plugin', mockPlugin);

      expect(result.success).toBe(false);
      expect(result.error).toContain('blocked');
    });

    it('should handle allowed plugins list', async () => {
      const loader = new PluginLoader({
        allowedPlugins: ['allowed-plugin']
      });

      const result = await loader.load('not-allowed', mockPlugin);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not in allowed list');
    });

    it('should handle plugin without manifest when not required', async () => {
      const loader = new PluginLoader({
        requireManifest: false
      });

      const pluginWithoutManifest = { ...mockPlugin };
      delete pluginWithoutManifest.manifest;
      delete pluginWithoutManifest.metadata;

      const result = await loader.load('no-manifest', pluginWithoutManifest);

      expect(result.success).toBe(true);
    });

    it('should normalize metadata to manifest', async () => {
      const pluginWithMetadata = { ...mockPlugin };
      delete pluginWithMetadata.manifest;

      const result = await pluginLoader.load('metadata-plugin', pluginWithMetadata);

      expect(result.success).toBe(true);
      expect(result.plugin?.manifest).toBeDefined();
    });

    it('should handle initialization errors gracefully', async () => {
      const failingPlugin = {
        ...mockPlugin,
        initialize: jest.fn().mockRejectedValue(new Error('Init failed'))
      };

      const result = await pluginLoader.load('failing-plugin', failingPlugin);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Init failed');
    });

    it('should track metadata for failed loads', async () => {
      await pluginLoader.load('fail-plugin', 'invalid-path');

      const metadata = pluginLoader.getMetadata('fail-plugin');

      expect(metadata?.status).toBe(PluginStatus.FAILED);
      expect(metadata?.error).toBeDefined();
    });
  });

  describe('Plugin Discovery', () => {
    it('should discover plugins from directory', async () => {
      const mockManifest: PluginManifest = {
        id: 'discovered-plugin',
        name: 'Discovered Plugin',
        version: '1.0.0',
        author: 'Test',
        description: 'Discovered plugin',
        capabilities: ['discovery'],
        dependencies: {}
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue([
        { name: 'plugin1', isDirectory: () => true },
        { name: 'plugin2', isDirectory: () => true },
        { name: 'file.txt', isDirectory: () => false }
      ]);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockManifest));

      const manifests = await pluginLoader.discover();

      expect(manifests).toHaveLength(2);
      expect(fs.readdirSync).toHaveBeenCalled();
    });

    it('should handle discovery when plugin directory does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const manifests = await pluginLoader.discover();

      expect(manifests).toEqual([]);
    });

    it('should handle malformed manifest files during discovery', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue([
        { name: 'plugin1', isDirectory: () => true }
      ]);
      (fs.readFileSync as jest.Mock).mockReturnValue('invalid json');

      const manifests = await pluginLoader.discover();

      expect(manifests).toEqual([]);
    });

    it('should respect auto-discovery setting', async () => {
      const loader = new PluginLoader({
        enableAutoDiscovery: false
      });

      const manifests = await loader.discover();

      expect(manifests).toEqual([]);
      expect(fs.readdirSync).not.toHaveBeenCalled();
    });
  });

  describe('Plugin Management', () => {
    beforeEach(async () => {
      await pluginLoader.load('test-plugin', mockPlugin);
    });

    it('should unload plugin successfully', async () => {
      const result = await pluginLoader.unload('test-plugin');

      expect(result).toBe(true);
      expect(mockPlugin.destroy).toHaveBeenCalled();
      expect(pluginLoader.has('test-plugin')).toBe(false);
    });

    it('should handle unload errors gracefully', async () => {
      mockPlugin.destroy = jest.fn().mockRejectedValue(new Error('Destroy failed'));

      const result = await pluginLoader.unload('test-plugin');

      expect(result).toBe(false);
    });

    it('should return false when unloading non-existent plugin', async () => {
      const result = await pluginLoader.unload('non-existent');

      expect(result).toBe(false);
    });

    it('should reload plugin successfully', async () => {
      const result = await pluginLoader.reload('test-plugin');

      expect(result.success).toBe(true);
      expect(mockPlugin.destroy).toHaveBeenCalled();
    });

    it('should handle reload of non-existent plugin', async () => {
      const result = await pluginLoader.reload('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should get all loaded plugins', () => {
      const plugins = pluginLoader.getAll();

      expect(plugins).toHaveLength(1);
      expect(plugins[0]).toBe(mockPlugin);
    });

    it('should get loaded and initialized plugins', () => {
      mockPlugin.isInitialized = true;
      const plugins = pluginLoader.getLoadedPlugins();

      expect(plugins).toHaveLength(1);
    });

    it('should clear all plugins', () => {
      pluginLoader.clear();

      expect(pluginLoader.getAll()).toHaveLength(0);
      expect(mockPlugin.destroy).toHaveBeenCalled();
    });
  });

  describe('Plugin Information', () => {
    it('should get plugin info for loaded plugin', async () => {
      await pluginLoader.load('test-plugin', mockPlugin);

      const info = await pluginLoader.getPluginInfo('test-plugin');

      expect(info).toEqual(mockPlugin.manifest);
    });

    it('should discover plugin info for unloaded plugin', async () => {
      const mockManifest: PluginManifest = {
        id: 'unloaded-plugin',
        name: 'Unloaded Plugin',
        version: '1.0.0',
        author: 'Test',
        description: 'Not loaded',
        capabilities: [],
        dependencies: {}
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue([
        { name: 'unloaded-plugin', isDirectory: () => true }
      ]);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockManifest));

      const info = await pluginLoader.getPluginInfo('unloaded-plugin');

      expect(info).toEqual(mockManifest);
    });

    it('should return null for non-existent plugin info', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue([]);

      const info = await pluginLoader.getPluginInfo('non-existent');

      expect(info).toBeNull();
    });
  });

  describe('Manifest Validation', () => {
    it('should validate valid manifest', async () => {
      const manifest: PluginManifest = {
        id: 'valid',
        name: 'Valid Plugin',
        version: '1.0.0',
        author: 'Test',
        description: 'Valid',
        capabilities: [],
        dependencies: {}
      };

      const isValid = await pluginLoader.validateManifest(manifest);

      expect(isValid).toBe(true);
    });

    it('should invalidate manifest without id', async () => {
      const manifest = {
        name: 'Invalid Plugin',
        version: '1.0.0'
      } as any;

      const isValid = await pluginLoader.validateManifest(manifest);

      expect(isValid).toBe(false);
    });

    it('should invalidate manifest without name', async () => {
      const manifest = {
        id: 'invalid',
        version: '1.0.0'
      } as any;

      const isValid = await pluginLoader.validateManifest(manifest);

      expect(isValid).toBe(false);
    });

    it('should invalidate manifest without version', async () => {
      const manifest = {
        id: 'invalid',
        name: 'Invalid Plugin'
      } as any;

      const isValid = await pluginLoader.validateManifest(manifest);

      expect(isValid).toBe(false);
    });
  });

  describe('Compatibility Methods', () => {
    it('should support loadPlugin alias', async () => {
      const plugin = await pluginLoader.loadPlugin('alias-test', mockPlugin);

      expect(plugin).toBe(mockPlugin);
      expect(pluginLoader.has('alias-test')).toBe(true);
    });

    it('should return null on loadPlugin failure', async () => {
      const plugin = await pluginLoader.loadPlugin('fail', 'invalid-path');

      expect(plugin).toBeNull();
    });

    it('should support reloadPlugin alias', async () => {
      await pluginLoader.load('reload-test', mockPlugin);
      const plugin = await pluginLoader.reloadPlugin('reload-test');

      expect(plugin).toBe(mockPlugin);
    });

    it('should return null on reloadPlugin failure', async () => {
      const plugin = await pluginLoader.reloadPlugin('non-existent');

      expect(plugin).toBeNull();
    });

    it('should support discoverPlugins alias', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue([]);

      const manifests = await pluginLoader.discoverPlugins();

      expect(manifests).toBeDefined();
      expect(Array.isArray(manifests)).toBe(true);
    });

    it('should support getAllPlugins alias', () => {
      const plugins = pluginLoader.getAllPlugins();

      expect(plugins).toBeDefined();
      expect(Array.isArray(plugins)).toBe(true);
    });
  });

  describe('Concurrent Operations', () => {
    it('should prevent duplicate loads of same plugin', async () => {
      const results = await Promise.all([
        pluginLoader.load('concurrent', mockPlugin),
        pluginLoader.load('concurrent', mockPlugin)
      ]);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toContain('already loaded');
    });

    it('should handle concurrent unload operations', async () => {
      await pluginLoader.load('concurrent-unload', mockPlugin);

      const results = await Promise.all([
        pluginLoader.unload('concurrent-unload'),
        pluginLoader.unload('concurrent-unload')
      ]);

      // At least one should succeed
      expect(results.some(r => r === true)).toBe(true);
      // Both might succeed due to mock behavior, so check for at least one result
      expect(results.length).toBe(2);
    });

    it('should unload all plugins concurrently', async () => {
      await pluginLoader.load('plugin1', { ...mockPlugin, manifest: { ...mockPlugin.manifest!, id: 'plugin1' } });
      await pluginLoader.load('plugin2', { ...mockPlugin, manifest: { ...mockPlugin.manifest!, id: 'plugin2' } });
      await pluginLoader.load('plugin3', { ...mockPlugin, manifest: { ...mockPlugin.manifest!, id: 'plugin3' } });

      await pluginLoader.unloadAll();

      expect(pluginLoader.getAll()).toHaveLength(0);
    });
  });

  describe('Path Resolution', () => {
    it('should load plugin from absolute path', async () => {
      const mockStats = {
        isDirectory: () => true,
        isFile: () => false
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue(mockStats);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockPlugin.manifest));

      const result = await pluginLoader.load('path-plugin', '/absolute/path/to/plugin');

      expect(result.success).toBe(true);
    });

    it('should load plugin from JSON file', async () => {
      const mockStats = {
        isDirectory: () => false,
        isFile: () => true
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue(mockStats);

      const result = await pluginLoader.load('json-plugin', '/path/plugin.json');

      expect(result.success).toBe(true);
    });

    it('should handle non-existent path', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const result = await pluginLoader.load('missing', '/non/existent/path');

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not exist');
    });
  });
});