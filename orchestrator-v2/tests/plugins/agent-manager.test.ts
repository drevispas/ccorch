import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AgentManager, PluginExecutionContext, ExecutionResult } from '../../core/plugins/agent-manager';
import { PluginLoader } from '../../core/plugins/plugin-loader';
import { CapabilityRegistry } from '../../core/plugins/capability-registry';
import { VersionManager } from '../../core/plugins/version-manager';
import {
  AgentContext,
  AgentResult,
  AgentPlugin,
  PluginManifest,
  ComplexityLevel,
  AgentCapability,
  AgentDefinition
} from '../../core/plugins/types';

// Mock implementations
jest.mock('../../core/plugins/plugin-loader');
jest.mock('../../core/plugins/capability-registry');
jest.mock('../../core/plugins/version-manager');

// Mock plugin for testing
class MockPlugin implements AgentPlugin {
  manifest: PluginManifest = {
    id: 'mock-plugin',
    name: 'Mock Plugin',
    version: '1.0.0',
    description: 'Mock plugin for testing',
    author: 'Test',
    dependencies: {},
    capabilities: ['backend-architecture'],
    complexityLevels: ['simple', 'moderate', 'complex'],
    entryPoint: './mock.ts'
  };
  metadata: PluginManifest = this.manifest;
  isInitialized: boolean = false;

  async initialize(): Promise<void> {
    // Mock initialization
    this.isInitialized = true;
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    return {
      success: true,
      data: { message: 'Mock execution', context }
    };
  }

  validate(input: any): { isValid: boolean; errors: string[] } {
    return { isValid: true, errors: [] };
  }

  async destroy(): Promise<void> {
    // Mock cleanup
  }

  getComplexityVariant(level: ComplexityLevel): AgentDefinition {
    return {
      id: `mock-${level}`,
      name: `Mock (${level})`,
      description: `Mock in ${level} mode`,
      complexity: level,
      systemPrompt: 'Mock prompt',
      tools: [],
      outputFormat: 'text'
    };
  }
}

describe('AgentManager', () => {
  let agentManager: AgentManager;
  let mockPluginLoader: jest.Mocked<PluginLoader>;
  let mockCapabilityRegistry: jest.Mocked<CapabilityRegistry>;
  let mockVersionManager: jest.Mocked<VersionManager>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock instances with required methods
    mockPluginLoader = {
      discoverPlugins: jest.fn(),
      loadPlugin: jest.fn(),
      load: jest.fn(),
      unload: jest.fn(),
      reload: jest.fn(),
      reloadPlugin: jest.fn(),
      get: jest.fn(),
      has: jest.fn(),
      discover: jest.fn(),
      unloadAll: jest.fn(),
      clear: jest.fn(),
      getAllPlugins: jest.fn(),
      getLoadedPlugins: jest.fn(),
      validateManifest: jest.fn(),
      getPluginInfo: jest.fn(),
      getAll: jest.fn(),
    } as any as jest.Mocked<PluginLoader>;

    mockCapabilityRegistry = {
      register: jest.fn(),
      unregister: jest.fn(),
      findCapabilities: jest.fn(),
      getCapability: jest.fn(),
      getAllCapabilities: jest.fn(),
      clear: jest.fn(),
      getCapabilityById: jest.fn(),
      clearPlugin: jest.fn(),
      getBestMatch: jest.fn(),
      get: jest.fn(),
      getAll: jest.fn(),
      search: jest.fn(),
      getByPlugin: jest.fn(),
    } as any as jest.Mocked<CapabilityRegistry>;

    mockVersionManager = {
      setVersion: jest.fn(),
      addVersion: jest.fn(),
      getLatestVersion: jest.fn(),
      getVersion: jest.fn(),
      getAllVersions: jest.fn(),
      compareVersions: jest.fn(),
      isCompatible: jest.fn(),
      checkCompatibility: jest.fn(),
      addDependency: jest.fn(),
      getDependencies: jest.fn(),
      checkDependencies: jest.fn(),
      canUpgrade: jest.fn(),
      clear: jest.fn(),
      isVersionSupported: jest.fn(),
    } as any as jest.Mocked<VersionManager>;

    // Create agent manager with config
    agentManager = new AgentManager({
      autoRegisterCapabilities: true,
      enableVersioning: true,
      maxConcurrentExecutions: 10
    });

    // Replace internal dependencies with mocks
    (agentManager as any).pluginLoader = mockPluginLoader;
    (agentManager as any).capabilityRegistry = mockCapabilityRegistry;
    (agentManager as any).versionManager = mockVersionManager;

    // Mock the discover method to avoid issues
    mockPluginLoader.discover.mockResolvedValue([]);
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const mockPlugins = [
        { id: 'plugin1', name: 'Plugin 1' },
        { id: 'plugin2', name: 'Plugin 2' }
      ] as PluginManifest[];

      mockPluginLoader.discover.mockResolvedValue(mockPlugins);
      mockPluginLoader.load.mockResolvedValue({
        success: true,
        plugin: new MockPlugin()
      });

      await agentManager.initialize();

      expect(mockPluginLoader.discover).toHaveBeenCalled();
    });

    it('should register plugin capabilities', async () => {
      const mockPlugin = new MockPlugin();
      const mockCapability: AgentCapability = {
        id: 'backend-architecture',
        name: 'Backend Architecture',
        description: 'Design backend systems',
        tags: ['backend', 'architecture'],
        requiredPermissions: ['code:write'],
        complexity: 'moderate' as ComplexityLevel
      };

      mockPluginLoader.discover.mockResolvedValue([mockPlugin.manifest]);
      mockPluginLoader.get.mockReturnValue(mockPlugin);
      mockPluginLoader.load.mockResolvedValue({
        success: true,
        plugin: mockPlugin
      });

      await agentManager.initialize();

      // Verify capability registration was called
      expect(mockCapabilityRegistry.register).toHaveBeenCalled();
    });

    it('should handle initialization errors gracefully', async () => {
      mockPluginLoader.discover.mockRejectedValue(
        new Error('Discovery failed')
      );

      // Initialize should handle errors gracefully in the new implementation
      await agentManager.initialize();
      // No error should be thrown
    });
  });

  describe('agent execution', () => {
    beforeEach(async () => {
      const mockPlugin = new MockPlugin();
      mockPluginLoader.discover.mockResolvedValue([mockPlugin.manifest]);
      mockPluginLoader.get.mockReturnValue(mockPlugin);
      mockPluginLoader.load.mockResolvedValue({
        success: true,
        plugin: mockPlugin
      });
      await agentManager.initialize();
    });

    it('should execute agent with context', async () => {
      const mockPlugin = new MockPlugin();
      jest.spyOn(mockPlugin, 'execute').mockResolvedValue({
        success: true,
        data: { result: 'test' }
      });

      // Mock getting plugin by capability
      mockCapabilityRegistry.getBestMatch.mockReturnValue({
        capability: {
          id: 'backend-architecture',
          name: 'Backend Architecture',
          description: 'Test',
          tags: [],
          requiredPermissions: [],
          complexity: 'moderate' as ComplexityLevel
        },
        score: 1.0,
        plugin: 'mock-plugin'  // Changed from pluginId to plugin
      });

      mockPluginLoader.get.mockReturnValue(mockPlugin);
      mockPluginLoader.load.mockResolvedValue({
        success: true,
        plugin: mockPlugin
      });

      const context: AgentContext = {
        task: 'Design a backend system',
        complexity: 'moderate' as ComplexityLevel,
        parameters: {},
        metadata: {
          workflowId: 'test-workflow',
          taskId: 'test-task'
        }
      };

      const result = await agentManager.executeAgent('backend-architect', context);

      expect(result.success).toBe(true);
      expect(mockPlugin.execute).toHaveBeenCalledWith(context);
    });

    it('should handle missing agent', async () => {
      mockCapabilityRegistry.getBestMatch.mockReturnValue(null);

      const context: AgentContext = {
        task: 'Unknown task',
        complexity: 'simple' as ComplexityLevel,
        parameters: {},
        metadata: {}
      };

      const result = await agentManager.executeAgent('unknown-agent', context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No suitable agent found');
    });

    it('should apply retry policy on failure', async () => {
      const mockPlugin = new MockPlugin();
      let attemptCount = 0;

      jest.spyOn(mockPlugin, 'execute').mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary failure');
        }
        return { success: true, data: { attempt: attemptCount } };
      });

      mockCapabilityRegistry.getBestMatch.mockReturnValue({
        capability: {
          id: 'test-capability',
          name: 'Test',
          description: 'Test',
          tags: [],
          requiredPermissions: [],
          complexity: 'simple' as ComplexityLevel
        },
        score: 1.0,
        plugin: 'mock-plugin'
      });

      mockPluginLoader.get.mockReturnValue(mockPlugin);
      mockPluginLoader.load.mockResolvedValue({
        success: true,
        plugin: mockPlugin
      });

      const context: AgentContext = {
        task: 'Retry test',
        complexity: 'simple' as ComplexityLevel,
        parameters: {},
        metadata: {}
      };

      // Set retry policy
      agentManager.setRetryPolicy({
        maxRetries: 3,
        backoffMultiplier: 1,
        initialDelay: 10
      });

      const result = await agentManager.executeAgent('test-agent', context);

      expect(result.success).toBe(true);
      expect(attemptCount).toBe(3);
    });

    it('should enforce timeout', async () => {
      const mockPlugin = new MockPlugin();

      // Create a timer reference we can clear
      let timeoutId: NodeJS.Timeout | undefined;

      jest.spyOn(mockPlugin, 'execute').mockImplementation(
        () => new Promise((resolve) => {
          timeoutId = setTimeout(resolve, 5000);
        })
      );

      // Ensure mockPluginLoader returns the new mock plugin with timeout behavior
      mockPluginLoader.get.mockReturnValue(mockPlugin);

      mockCapabilityRegistry.getBestMatch.mockReturnValue({
        capability: {
          id: 'test-capability',
          name: 'Test',
          description: 'Test',
          tags: [],
          requiredPermissions: [],
          complexity: 'simple' as ComplexityLevel
        },
        score: 1.0,
        plugin: 'mock-plugin'
      });

      mockPluginLoader.load.mockResolvedValue({
        success: true,
        plugin: mockPlugin
      });

      const context: AgentContext = {
        task: 'Timeout test',
        complexity: 'simple' as ComplexityLevel,
        parameters: {},
        metadata: {}
      };

      // Set short timeout
      agentManager.setDefaultTimeout(100);

      const result = await agentManager.executeAgent('test-agent', context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');

      // Clean up the timer
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }, 10000);
  });

  describe('agent discovery', () => {
    beforeEach(async () => {
      const mockPlugin = new MockPlugin();
      mockPluginLoader.discover.mockResolvedValue([mockPlugin.manifest]);
      mockPluginLoader.get.mockReturnValue(mockPlugin);
      mockPluginLoader.load.mockResolvedValue({
        success: true,
        plugin: mockPlugin
      });
      await agentManager.initialize();
    });

    it('should find agents by capability', async () => {
      const mockCapabilities: AgentCapability[] = [
        {
          id: 'backend-architecture',
          name: 'Backend Architecture',
          description: 'Design systems',
          tags: ['backend', 'architecture'],
          requiredPermissions: ['code:write'],
          complexity: 'moderate' as ComplexityLevel
        }
      ];

      mockCapabilityRegistry.findCapabilities.mockReturnValue(
        mockCapabilities.map(c => ({
          capability: c,
          score: 1.0,
          plugin: 'mock-plugin'
        }))
      );

      const agents = await agentManager.findAgentsByCapability({
        tags: ['backend']
      });

      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe('backend-architecture');
    });

    it('should get all available agents', async () => {
      const mockCapabilities: AgentCapability[] = [
        {
          id: 'agent1',
          name: 'Agent 1',
          description: 'Test agent 1',
          tags: ['test'],
          requiredPermissions: [],
          complexity: 'simple' as ComplexityLevel
        },
        {
          id: 'agent2',
          name: 'Agent 2',
          description: 'Test agent 2',
          tags: ['test'],
          requiredPermissions: [],
          complexity: 'moderate' as ComplexityLevel
        }
      ];

      mockCapabilityRegistry.getAllCapabilities.mockReturnValue(mockCapabilities);

      const agents = await agentManager.getAvailableAgents();

      expect(agents).toHaveLength(2);
      expect(agents.map(a => a.id)).toContain('agent1');
      expect(agents.map(a => a.id)).toContain('agent2');
    });
  });

  describe('plugin management', () => {
    it('should reload plugin', async () => {
      const mockPlugin = new MockPlugin();
      mockPluginLoader.reloadPlugin.mockResolvedValue(undefined);
      mockPluginLoader.get.mockReturnValue(mockPlugin);
      mockPluginLoader.load.mockResolvedValue({
        success: true,
        plugin: mockPlugin
      });

      await agentManager.reloadPlugin('mock-plugin');

      expect(mockPluginLoader.reloadPlugin).toHaveBeenCalledWith('mock-plugin');
      expect(mockCapabilityRegistry.clearPlugin).toHaveBeenCalledWith('mock-plugin');
    });

    it('should get plugin status', async () => {
      const mockPlugin = new MockPlugin();
      mockPluginLoader.getPluginInfo.mockResolvedValue(mockPlugin.metadata);

      mockVersionManager.getLatestVersion.mockReturnValue('1.0.0');
      mockVersionManager.isVersionSupported.mockReturnValue(true);

      const status = await agentManager.getPluginStatus('mock-plugin');

      expect(status).toMatchObject({
        id: 'mock-plugin',
        version: '1.0.0',
        isLoaded: expect.any(Boolean),
        isSupported: true
      });
    });
  });

  describe('configuration', () => {
    it('should set and use retry policy', () => {
      const policy = {
        maxRetries: 5,
        backoffMultiplier: 2,
        initialDelay: 100
      };

      agentManager.setRetryPolicy(policy);

      const currentPolicy = agentManager.getRetryPolicy();
      expect(currentPolicy).toEqual(policy);
    });

    it('should set and use default timeout', () => {
      agentManager.setDefaultTimeout(5000);

      const timeout = agentManager.getDefaultTimeout();
      expect(timeout).toBe(5000);
    });
  });

  describe('error handling', () => {
    it('should handle plugin execution errors', async () => {
      const mockPlugin = new MockPlugin();
      jest.spyOn(mockPlugin, 'execute').mockRejectedValue(
        new Error('Plugin execution failed')
      );

      mockCapabilityRegistry.getBestMatch.mockReturnValue({
        capability: {
          id: 'test',
          name: 'Test',
          description: 'Test',
          tags: [],
          requiredPermissions: [],
          complexity: 'simple' as ComplexityLevel
        },
        score: 1.0,
        plugin: 'mock-plugin'
      });

      mockPluginLoader.get.mockReturnValue(mockPlugin);
      mockPluginLoader.load.mockResolvedValue({
        success: true,
        plugin: mockPlugin
      });

      const context: AgentContext = {
        task: 'Error test',
        complexity: 'simple' as ComplexityLevel,
        parameters: {},
        metadata: {}
      };

      const result = await agentManager.executeAgent('test-agent', context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Plugin execution failed');
    });

    it('should handle version incompatibility', async () => {
      const mockPlugin = new MockPlugin();
      mockPluginLoader.get.mockReturnValue(mockPlugin);
      mockVersionManager.getVersion.mockReturnValue('1.0.0');
      mockVersionManager.isVersionSupported.mockReturnValue(false);

      const status = await agentManager.getPluginStatus('mock-plugin');

      expect(status.isSupported).toBe(false);
    });
  });

  describe('singleton pattern', () => {
    it('should return same instance', () => {
      const instance1 = AgentManager.getInstance();
      const instance2 = AgentManager.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should allow custom configuration for singleton', () => {
      const config = {
        pluginDirectory: '/custom/plugins',
        enableCaching: false
      };

      const instance = AgentManager.getInstance(config);
      expect(instance).toBeDefined();
    });
  });
});