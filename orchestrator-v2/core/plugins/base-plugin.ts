import { AgentPlugin, PluginManifest } from './types';

export abstract class BasePlugin implements AgentPlugin {
  public manifest: PluginManifest;
  public metadata?: PluginManifest; // Alias for compatibility
  public isInitialized: boolean = false;
  protected config: any;
  private initializationPromise?: Promise<void>;

  constructor(manifest: PluginManifest) {
    this.manifest = manifest;
    this.metadata = manifest; // Set both for compatibility
  }

  async initialize(config?: any): Promise<void> {
    // Prevent concurrent initialization
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    if (this.isInitialized) {
      return;
    }

    this.initializationPromise = this.doInitialize(config);
    try {
      await this.initializationPromise;
    } finally {
      this.initializationPromise = undefined;
    }
  }

  private async doInitialize(config?: any): Promise<void> {
    this.config = config || {};
    await this.onInitialize();
    this.isInitialized = true;
  }

  abstract execute(params: any): Promise<any>;

  async destroy(): Promise<void> {
    await this.onDestroy();
    this.isInitialized = false;
  }

  protected async onInitialize(): Promise<void> {
    // Override in subclasses for custom initialization
  }

  protected async onDestroy(): Promise<void> {
    // Override in subclasses for custom cleanup
  }

  protected validateParams(params: any, schema?: any): void {
    if (!schema) return;

    // Simple validation - in production would use a schema validator
    if (schema.type === 'object' && schema.required) {
      for (const field of schema.required) {
        if (!(field in params)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }
    }
  }

  protected async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | null = setTimeout(() => {
        timer = null;
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      fn()
        .then(result => {
          if (timer) {
            clearTimeout(timer);
            resolve(result);
          }
        })
        .catch(error => {
          if (timer) {
            clearTimeout(timer);
            reject(error);
          }
        });
    });
  }
}

export class SimplePlugin extends BasePlugin {
  private executeHandler?: (params: any) => Promise<any>;

  constructor(
    manifest: PluginManifest,
    executeHandler?: (params: any) => Promise<any>
  ) {
    super(manifest);
    this.executeHandler = executeHandler;
    this.metadata = manifest; // Ensure metadata is set for compatibility
  }

  async execute(params: any): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Plugin not initialized');
    }

    if (this.executeHandler) {
      return this.executeHandler(params);
    }

    return { success: true, data: params };
  }
}

export class CompositePlugin extends BasePlugin {
  private plugins: Map<string, AgentPlugin> = new Map();

  constructor(manifest: PluginManifest) {
    super(manifest);
  }

  addPlugin(id: string, plugin: AgentPlugin): void {
    this.plugins.set(id, plugin);
  }

  removePlugin(id: string): boolean {
    return this.plugins.delete(id);
  }

  async execute(params: any): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Plugin not initialized');
    }

    const { pluginId, ...pluginParams } = params;

    if (pluginId) {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        throw new Error(`Sub-plugin not found: ${pluginId}`);
      }
      return plugin.execute(pluginParams);
    }

    // Execute all plugins in parallel
    const results: Record<string, any> = {};
    const promises: Promise<void>[] = [];

    for (const [id, plugin] of this.plugins) {
      promises.push(
        plugin.execute(pluginParams).then(result => {
          results[id] = result;
        })
      );
    }

    await Promise.all(promises);
    return results;
  }

  protected async onInitialize(): Promise<void> {
    // Initialize all sub-plugins
    const promises: Promise<void>[] = [];
    for (const plugin of this.plugins.values()) {
      promises.push(plugin.initialize(this.config));
    }
    await Promise.all(promises);
  }

  protected async onDestroy(): Promise<void> {
    // Destroy all sub-plugins
    const promises: Promise<void>[] = [];
    for (const plugin of this.plugins.values()) {
      promises.push(plugin.destroy());
    }
    await Promise.allSettled(promises); // Use allSettled to ensure all plugins are cleaned up
  }
}

// Re-export BaseAgentPlugin from the new file
export { BaseAgentPlugin } from './base-agent-plugin';