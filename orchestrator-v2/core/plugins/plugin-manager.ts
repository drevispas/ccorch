import { EventEmitter } from 'events';
import * as path from 'path';
import {
  AgentPlugin,
  PluginManifest,
  PluginConfig,
  PluginLoadResult,
  PluginMetadata,
  ComplexityLevel,
  AgentCapability,
  CapabilityQuery,
  CapabilityMatch,
} from './types';
import { PluginLoader } from './plugin-loader';
import { CapabilityRegistry } from './capability-registry';
import { BasePlugin } from './base-plugin';
import { PluginStatus } from '../enums';

export interface PluginManagerOptions extends PluginConfig {
  logger?: any;
}

export class PluginManager extends EventEmitter {
  private plugins: Map<string, AgentPlugin> = new Map();
  private metadata: Map<string, PluginMetadata> = new Map();
  private loader: PluginLoader;
  private registry: CapabilityRegistry;
  private config: PluginManagerOptions;
  private logger?: any;
  private isInitialized: boolean = false;

  constructor(options: PluginManagerOptions = {}) {
    super();
    this.config = {
      pluginsDir: options.pluginsDir || options.pluginDirectory || './plugins',
      enableAutoDiscovery: options.enableAutoDiscovery ?? true,
      requireManifest: options.requireManifest ?? false,
      maxConcurrentLoads: options.maxConcurrentLoads || 5,
      enableCaching: options.enableCaching ?? true,
      autoReload: options.autoReload ?? false,
      ...options,
    };

    this.logger = options.logger;
    this.loader = new PluginLoader(this.config);
    this.registry = new CapabilityRegistry();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.log('info', 'Initializing plugin manager');

    // Auto-discover plugins if enabled
    if (this.config.enableAutoDiscovery) {
      await this.discoverPlugins();
    }

    this.isInitialized = true;
    this.emit('initialized');
    this.log('info', 'Plugin manager initialized');
  }

  async loadPlugin(pluginPath: string, manifest?: PluginManifest): Promise<PluginLoadResult> {
    try {
      // Check if plugin is blocked
      if (this.isPluginBlocked(pluginPath)) {
        return {
          success: false,
          error: `Plugin ${pluginPath} is blocked by configuration`,
        };
      }

      // Check if plugin is already loaded
      const pluginId = manifest?.id || path.basename(pluginPath);
      if (this.plugins.has(pluginId)) {
        this.log('warn', `Plugin ${pluginId} is already loaded`);
        return {
          success: true,
          plugin: this.plugins.get(pluginId),
        };
      }

      // Update metadata
      this.metadata.set(pluginId, {
        loadedAt: new Date(),
        status: PluginStatus.LOADING,
        path: pluginPath,
      });

      // Load plugin using loader
      const result = await this.loader.loadPlugin(pluginId, pluginPath);

      if (!result) {
        this.metadata.set(pluginId, {
          loadedAt: new Date(),
          status: PluginStatus.FAILED,
          error: `Failed to load plugin from ${pluginPath}`,
          path: pluginPath,
        });
        return {
          success: false,
          error: `Failed to load plugin from ${pluginPath}`
        };
      }

      const plugin = result;

      // Initialize plugin
      await plugin.initialize(this.config);

      // Register plugin and its capabilities
      this.plugins.set(pluginId, plugin);
      this.registerPluginCapabilities(pluginId, plugin);

      // Update metadata
      this.metadata.set(pluginId, {
        loadedAt: new Date(),
        status: PluginStatus.LOADED,
        path: pluginPath,
      });

      this.emit('plugin-loaded', { id: pluginId, plugin });
      this.log('info', `Plugin ${pluginId} loaded successfully`);

      return { success: true, plugin };
    } catch (error: any) {
      const errorMsg = `Failed to load plugin: ${error.message}`;
      this.log('error', errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  async unloadPlugin(pluginId: string): Promise<boolean> {
    try {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        this.log('warn', `Plugin ${pluginId} not found`);
        return false;
      }

      // Update metadata
      this.metadata.set(pluginId, {
        ...this.metadata.get(pluginId)!,
        status: PluginStatus.UNLOADING,
      });

      // Destroy plugin
      await plugin.destroy();

      // Remove plugin and its capabilities
      this.plugins.delete(pluginId);
      this.unregisterPluginCapabilities(pluginId);
      this.metadata.delete(pluginId);

      this.emit('plugin-unloaded', { id: pluginId });
      this.log('info', `Plugin ${pluginId} unloaded successfully`);

      return true;
    } catch (error: any) {
      this.log('error', `Failed to unload plugin ${pluginId}: ${error.message}`);
      return false;
    }
  }

  async reloadPlugin(pluginId: string): Promise<PluginLoadResult> {
    const metadata = this.metadata.get(pluginId);
    if (!metadata || !metadata.path) {
      return {
        success: false,
        error: `Plugin ${pluginId} not found or path unknown`,
      };
    }

    await this.unloadPlugin(pluginId);
    return this.loadPlugin(metadata.path);
  }

  getPlugin(pluginId: string): AgentPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  getPluginByCapability(capabilityId: string): AgentPlugin | undefined {
    // Find plugin that has this capability
    for (const [pluginId, plugin] of this.plugins) {
      const capabilities = plugin.metadata?.capabilities || [];
      if (capabilities.some(cap => typeof cap === 'object' && cap.id === capabilityId)) {
        return plugin;
      }
    }
    return undefined;
  }

  getPluginsByComplexity(complexity: ComplexityLevel): AgentPlugin[] {
    const plugins: AgentPlugin[] = [];
    for (const [id, plugin] of this.plugins) {
      const manifest = plugin.manifest || plugin.metadata;
      if (manifest?.complexityLevels?.includes(complexity)) {
        plugins.push(plugin);
      }
    }
    return plugins;
  }

  findCapabilities(query: CapabilityQuery): CapabilityMatch[] {
    return this.registry.findCapabilities(query);
  }

  async getAgent(agentName: string, complexity: ComplexityLevel = ComplexityLevel.MODERATE): Promise<AgentPlugin | null> {
    // Find capabilities matching the agent name and complexity
    const matches = this.findCapabilities({
      keywords: [agentName],
      complexity,
    });

    if (matches.length === 0) {
      return null;
    }

    // Get the best matching plugin
    const bestMatch = matches[0];
    const pluginId = bestMatch.plugin;

    if (!pluginId) {
      return null;
    }

    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return null;
    }

    // Ensure plugin is initialized
    if (!plugin.isInitialized) {
      await plugin.initialize();
    }

    return plugin;
  }

  getAllPlugins(): Map<string, AgentPlugin> {
    return new Map(this.plugins);
  }

  getPluginMetadata(pluginId: string): PluginMetadata | undefined {
    return this.metadata.get(pluginId);
  }

  async executePlugin(
    pluginId: string,
    params: any,
    options?: { timeout?: number }
  ): Promise<any> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (!plugin.isInitialized) {
      throw new Error(`Plugin ${pluginId} not initialized`);
    }

    // Execute with timeout if specified
    if (options?.timeout && plugin instanceof BasePlugin) {
      return (plugin as any).executeWithTimeout(
        () => plugin.execute(params),
        options.timeout
      );
    }

    return plugin.execute(params);
  }

  async destroy(): Promise<void> {
    this.log('info', 'Destroying plugin manager');

    // Unload all plugins
    const unloadPromises: Promise<boolean>[] = [];
    for (const pluginId of this.plugins.keys()) {
      unloadPromises.push(this.unloadPlugin(pluginId));
    }
    await Promise.all(unloadPromises);

    // Clear registries
    this.plugins.clear();
    this.metadata.clear();
    this.registry.clear();

    this.isInitialized = false;
    this.emit('destroyed');
    this.log('info', 'Plugin manager destroyed');
  }

  private async discoverPlugins(): Promise<void> {
    try {
      this.log('info', `Discovering plugins in ${this.config.pluginsDir}`);

      // Use the plugin loader's discover method to find available plugins
      const manifests = await this.loader.discover();

      if (manifests.length === 0) {
        this.log('warn', 'No plugins discovered');
        return;
      }

      // Load discovered plugins with concurrency limit
      const concurrent = this.config.maxConcurrentLoads || 5;
      const loadPromises: Promise<void>[] = [];

      // Process manifests in batches
      for (let i = 0; i < manifests.length; i += concurrent) {
        const batch = manifests.slice(i, Math.min(i + concurrent, manifests.length));
        const batchPromises = batch.map(async (manifest) => {
          try {
            const pluginPath = path.join(this.config.pluginsDir!, manifest.id);
            if (!this.isPluginBlocked(pluginPath)) {
              const result = await this.loadPlugin(pluginPath);
              if (!result.success) {
                this.log('warn', `Failed to load plugin ${manifest.id}: ${result.error}`);
              }
            }
          } catch (error: any) {
            this.log('error', `Error loading plugin ${manifest.id}: ${error.message}`);
          }
        });

        await Promise.all(batchPromises);
        loadPromises.push(...batchPromises);
      }

      this.log('info', `Discovered and processed ${manifests.length} plugin manifests`);
    } catch (error: any) {
      this.log('error', `Plugin discovery failed: ${error.message}`);
    }
  }

  private registerPluginCapabilities(pluginId: string, plugin: AgentPlugin): void {
    const manifest = plugin.manifest || plugin.metadata;
    if (!manifest) return;

    const capabilities = manifest.capabilities || [];

    for (const cap of capabilities) {
      if (typeof cap === 'string') {
        // Simple string capability
        this.registry.registerCapability(pluginId, {
          id: `${pluginId}.${cap}`,
          name: cap,
          description: cap,
          tags: [],
          requiredPermissions: [],
          complexity: ComplexityLevel.SIMPLE,
          estimatedDuration: 1000,
          keywords: [cap],
        });
      } else {
        // Full capability object
        this.registry.registerCapability(pluginId, cap as AgentCapability);
      }
    }
  }

  private unregisterPluginCapabilities(pluginId: string): void {
    try {
      // Get all capabilities registered by this plugin
      const capabilities = this.registry.getByPlugin(pluginId);

      // Unregister each capability
      for (const capability of capabilities) {
        this.registry.unregister(capability.id);
        this.log('debug', `Unregistered capability ${capability.id} from plugin ${pluginId}`);
      }

      if (capabilities.length > 0) {
        this.log('info', `Unregistered ${capabilities.length} capabilities from plugin ${pluginId}`);
      }
    } catch (error: any) {
      this.log('error', `Failed to unregister capabilities for plugin ${pluginId}: ${error.message}`);
    }
  }

  private isPluginBlocked(pluginPath: string): boolean {
    if (!this.config.blockedPlugins || this.config.blockedPlugins.length === 0) {
      return false;
    }

    const pluginName = path.basename(pluginPath);
    return this.config.blockedPlugins.includes(pluginName);
  }

  private log(level: string, message: string): void {
    if (this.logger) {
      this.logger[level]?.(message);
    } else {
      console.log(`[PluginManager] ${level.toUpperCase()}: ${message}`);
    }
  }
}