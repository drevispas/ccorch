import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { PluginLoader } from '../../core/plugins/plugin-loader';
import { AgentPlugin, PluginManifest, ComplexityLevel } from '../../core/plugins/types';

// Mock fs module
jest.mock('fs');
jest.mock('path');

describe('PluginLoader', () => {
  let pluginLoader: PluginLoader;
  const mockPluginDir = '/mock/plugins';
  const mockManifest: PluginManifest = {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'Test plugin for unit tests',
    author: 'Test Author',
    dependencies: {},
    capabilities: ['test-capability'],
    complexityLevels: ['simple', 'moderate', 'complex'],
    entryPoint: './index.ts'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    pluginLoader = new PluginLoader({
      pluginDirectory: mockPluginDir,
      enableCaching: true,
      autoReload: false
    });
  });

  describe('loadPlugin', () => {
    it('should load a plugin successfully', async () => {
      const pluginPath = path.join(mockPluginDir, 'test-plugin');
      const manifestPath = path.join(pluginPath, 'manifest.json');

      // Mock file system operations
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockManifest));

      // Mock dynamic import
      const mockPlugin: Partial<AgentPlugin> = {
        metadata: mockManifest,
        initialize: jest.fn().mockResolvedValue(undefined),
        execute: jest.fn().mockResolvedValue({ success: true, data: {} }),
        destroy: jest.fn().mockResolvedValue(undefined),
        getComplexityVariant: jest.fn().mockReturnValue({})
      };

      jest.spyOn(pluginLoader as any, 'importPlugin').mockResolvedValue(mockPlugin);

      const plugin = await pluginLoader.loadPlugin('test-plugin');

      expect(plugin).toBeDefined();
      expect(plugin.metadata.id).toBe('test-plugin');
      expect(mockPlugin.initialize).toHaveBeenCalled();
    });

    it('should throw error if plugin directory does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      await expect(pluginLoader.loadPlugin('non-existent')).rejects.toThrow(
        'Plugin directory not found'
      );
    });

    it('should throw error if manifest is invalid', async () => {
      const pluginPath = path.join(mockPluginDir, 'invalid-plugin');

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('invalid json');

      await expect(pluginLoader.loadPlugin('invalid-plugin')).rejects.toThrow();
    });

    it('should use cached plugin if available', async () => {
      const pluginPath = path.join(mockPluginDir, 'test-plugin');

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockManifest));

      const mockPlugin: Partial<AgentPlugin> = {
        metadata: mockManifest,
        initialize: jest.fn().mockResolvedValue(undefined),
        execute: jest.fn().mockResolvedValue({ success: true }),
        destroy: jest.fn().mockResolvedValue(undefined),
        getComplexityVariant: jest.fn()
      };

      const importSpy = jest.spyOn(pluginLoader as any, 'importPlugin')
        .mockResolvedValue(mockPlugin);

      // Load plugin twice
      const plugin1 = await pluginLoader.loadPlugin('test-plugin');
      const plugin2 = await pluginLoader.loadPlugin('test-plugin');

      // Should only import once due to caching
      expect(importSpy).toHaveBeenCalledTimes(1);
      expect(plugin1).toBe(plugin2);
    });
  });

  describe('discoverPlugins', () => {
    it('should discover all plugins in directory', async () => {
      const mockPlugins = ['plugin1', 'plugin2', 'plugin3'];

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue(mockPlugins);

      mockPlugins.forEach(pluginId => {
        const pluginPath = path.join(mockPluginDir, pluginId, 'manifest.json');
        (fs.existsSync as jest.Mock).mockImplementation((p) => p === pluginPath);
        (fs.readFileSync as jest.Mock).mockImplementation((p) => {
          if (p === pluginPath) {
            return JSON.stringify({
              ...mockManifest,
              id: pluginId,
              name: `Plugin ${pluginId}`
            });
          }
        });
      });

      const discovered = await pluginLoader.discoverPlugins();

      expect(discovered).toHaveLength(3);
      expect(discovered.map(p => p.id)).toEqual(mockPlugins);
    });

    it('should skip directories without manifest', async () => {
      (fs.existsSync as jest.Mock).mockImplementation((p) => {
        return p === mockPluginDir;
      });
      (fs.readdirSync as jest.Mock).mockReturnValue(['plugin1', 'not-a-plugin']);

      const discovered = await pluginLoader.discoverPlugins();

      expect(discovered).toHaveLength(0);
    });
  });

  describe('validateManifest', () => {
    it('should validate correct manifest', () => {
      const isValid = (pluginLoader as any).validateManifest(mockManifest);
      expect(isValid).toBe(true);
    });

    it('should reject manifest with missing required fields', () => {
      const invalidManifest = { ...mockManifest };
      delete (invalidManifest as any).id;

      const isValid = (pluginLoader as any).validateManifest(invalidManifest);
      expect(isValid).toBe(false);
    });

    it('should reject manifest with invalid version format', () => {
      const invalidManifest = {
        ...mockManifest,
        version: 'not-a-version'
      };

      const isValid = (pluginLoader as any).validateManifest(invalidManifest);
      expect(isValid).toBe(false);
    });
  });

  describe('reloadPlugin', () => {
    it('should reload plugin and clear cache', async () => {
      const pluginPath = path.join(mockPluginDir, 'test-plugin');

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockManifest));

      const mockPlugin: Partial<AgentPlugin> = {
        metadata: mockManifest,
        initialize: jest.fn().mockResolvedValue(undefined),
        execute: jest.fn().mockResolvedValue({ success: true }),
        destroy: jest.fn().mockResolvedValue(undefined),
        getComplexityVariant: jest.fn()
      };

      const importSpy = jest.spyOn(pluginLoader as any, 'importPlugin')
        .mockResolvedValue(mockPlugin);

      // Load plugin
      const plugin1 = await pluginLoader.loadPlugin('test-plugin');

      // Reload plugin
      await pluginLoader.reloadPlugin('test-plugin');
      const plugin2 = await pluginLoader.loadPlugin('test-plugin');

      // Should call destroy on old plugin
      expect(mockPlugin.destroy).toHaveBeenCalled();

      // Should import twice (initial load + reload)
      expect(importSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('getPluginInfo', () => {
    it('should return plugin information', async () => {
      const pluginPath = path.join(mockPluginDir, 'test-plugin');

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockManifest));

      const info = await pluginLoader.getPluginInfo('test-plugin');

      expect(info).toEqual(mockManifest);
    });

    it('should return null for non-existent plugin', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const info = await pluginLoader.getPluginInfo('non-existent');

      expect(info).toBeNull();
    });
  });

  describe('hot reload', () => {
    it('should watch for file changes when autoReload is enabled', () => {
      const watchLoader = new PluginLoader({
        pluginDirectory: mockPluginDir,
        enableCaching: true,
        autoReload: true
      });

      const watchSpy = jest.spyOn(fs, 'watch');

      (watchLoader as any).setupFileWatcher('test-plugin');

      expect(watchSpy).toHaveBeenCalledWith(
        expect.stringContaining('test-plugin'),
        expect.any(Function)
      );
    });
  });
});