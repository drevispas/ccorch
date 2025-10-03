import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BaseAgentPlugin } from '../../core/plugins/base-plugin';
import {
  AgentContext,
  AgentResult,
  PluginManifest,
  ComplexityLevel,
  AgentDefinition
} from '../../core/plugins/types';

// Mock plugin for testing
class TestPlugin extends BaseAgentPlugin {
  constructor() {
    const manifest: PluginManifest = {
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
    super(manifest);
  }

  protected async executeInternal(context: AgentContext): Promise<AgentResult> {
    return {
      success: true,
      data: {
        message: 'Test execution successful',
        complexity: context.complexity
      }
    };
  }

  getComplexityVariant(level: ComplexityLevel): AgentDefinition {
    return {
      id: `test-plugin-${level}`,
      name: `Test Plugin (${level})`,
      description: `Test plugin in ${level} mode`,
      complexity: level,
      systemPrompt: `You are a test agent in ${level} mode`,
      tools: [],
      outputFormat: 'text'
    };
  }
}

describe('BaseAgentPlugin', () => {
  let plugin: TestPlugin;

  beforeEach(() => {
    plugin = new TestPlugin();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with metadata', async () => {
      await plugin.initialize();

      expect(plugin.metadata).toBeDefined();
      expect(plugin.metadata.id).toBe('test-plugin');
      expect(plugin.metadata.version).toBe('1.0.0');
      expect(plugin.isInitialized).toBe(true);
    });

    it('should not initialize twice', async () => {
      await plugin.initialize();
      await plugin.initialize();

      // Should still be initialized
      expect(plugin.isInitialized).toBe(true);
    });

    it('should handle initialization errors', async () => {
      const errorPlugin = new TestPlugin();
      jest.spyOn(errorPlugin as any, 'onInitialize').mockRejectedValue(
        new Error('Init failed')
      );

      await expect(errorPlugin.initialize()).rejects.toThrow('Init failed');
      expect(errorPlugin.isInitialized).toBe(false);
    });
  });

  describe('validation', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should validate correct input', () => {
      const input = {
        task: 'Test task',
        complexity: 'simple' as ComplexityLevel,
        context: {
          workflowId: 'test-workflow',
          taskId: 'test-task'
        }
      };

      const result = plugin.validate(input);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid complexity level', () => {
      const input = {
        task: 'Test task',
        complexity: 'invalid' as ComplexityLevel,
        context: {}
      };

      const result = plugin.validate(input);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid complexity level: invalid');
    });

    it('should reject missing required fields', () => {
      const input = {
        complexity: 'simple'
        // Missing task
      };

      const result = plugin.validate(input);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should use custom validation schema if provided', () => {
      const customPlugin = new TestPlugin();
      customPlugin.setValidationSchema({
        type: 'object',
        properties: {
          customField: { type: 'string' }
        },
        required: ['customField']
      });

      const result = customPlugin.validate({ customField: 'value' });
      expect(result.isValid).toBe(true);
    });
  });

  describe('execution', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should execute successfully', async () => {
      const context: AgentContext = {
        task: 'Test task',
        complexity: 'moderate' as ComplexityLevel,
        parameters: {},
        metadata: {
          workflowId: 'test-workflow',
          taskId: 'test-task',
          correlationId: 'test-correlation'
        }
      };

      const result = await plugin.execute(context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.complexity).toBe('moderate');
    });

    it('should require initialization before execution', async () => {
      const newPlugin = new TestPlugin();

      const context: AgentContext = {
        task: 'Test task',
        complexity: 'simple' as ComplexityLevel,
        parameters: {},
        metadata: {}
      };

      await expect(newPlugin.execute(context)).rejects.toThrow(
        'Plugin not initialized'
      );
    });

    it('should handle execution errors', async () => {
      jest.spyOn(plugin as any, 'executeInternal').mockRejectedValue(
        new Error('Execution failed')
      );

      const context: AgentContext = {
        task: 'Test task',
        complexity: 'simple' as ComplexityLevel,
        parameters: {},
        metadata: {}
      };

      const result = await plugin.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution failed');
    });

    it('should include timing information', async () => {
      const context: AgentContext = {
        task: 'Test task',
        complexity: 'simple' as ComplexityLevel,
        parameters: {},
        metadata: {}
      };

      const result = await plugin.execute(context);

      expect(result.metadata?.executionTime).toBeDefined();
      expect(result.metadata?.executionTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('lifecycle hooks', () => {
    it('should call lifecycle hooks', async () => {
      const onInitSpy = jest.spyOn(plugin as any, 'onInitialize');
      const onDestroySpy = jest.spyOn(plugin as any, 'onDestroy');

      await plugin.initialize();
      expect(onInitSpy).toHaveBeenCalled();

      await plugin.destroy();
      expect(onDestroySpy).toHaveBeenCalled();
      expect(plugin.isInitialized).toBe(false);
    });

    it('should handle destroy errors gracefully', async () => {
      await plugin.initialize();

      jest.spyOn(plugin as any, 'onDestroy').mockRejectedValue(
        new Error('Destroy failed')
      );

      // Should not throw
      await expect(plugin.destroy()).resolves.not.toThrow();
      expect(plugin.isInitialized).toBe(false);
    });
  });

  describe('complexity variants', () => {
    it('should return different variants for complexity levels', () => {
      const simple = plugin.getComplexityVariant('simple');
      const moderate = plugin.getComplexityVariant('moderate');
      const complex = plugin.getComplexityVariant('complex');

      expect(simple.complexity).toBe('simple');
      expect(moderate.complexity).toBe('moderate');
      expect(complex.complexity).toBe('complex');

      expect(simple.systemPrompt).toContain('simple');
      expect(moderate.systemPrompt).toContain('moderate');
      expect(complex.systemPrompt).toContain('complex');
    });

    it('should support all declared complexity levels', () => {
      const levels = plugin.metadata.complexityLevels;

      levels?.forEach(level => {
        const variant = plugin.getComplexityVariant(level);
        expect(variant).toBeDefined();
        expect(variant.complexity).toBe(level);
      });
    });
  });

  describe('capabilities', () => {
    it('should return plugin capabilities', () => {
      const capabilities = plugin.getCapabilities();

      expect(capabilities).toEqual(['test-capability']);
    });

    it('should check if capability is supported', () => {
      expect(plugin.hasCapability('test-capability')).toBe(true);
      expect(plugin.hasCapability('unsupported-capability')).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should provide error details in result', async () => {
      await plugin.initialize();

      const errorMessage = 'Custom error';
      jest.spyOn(plugin as any, 'executeInternal').mockRejectedValue(
        new Error(errorMessage)
      );

      const context: AgentContext = {
        task: 'Test task',
        complexity: 'simple' as ComplexityLevel,
        parameters: {},
        metadata: {}
      };

      const result = await plugin.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
    });

    it('should handle non-Error exceptions', async () => {
      await plugin.initialize();

      jest.spyOn(plugin as any, 'executeInternal').mockRejectedValue(
        'String error'
      );

      const context: AgentContext = {
        task: 'Test task',
        complexity: 'simple' as ComplexityLevel,
        parameters: {},
        metadata: {}
      };

      const result = await plugin.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('String error');
    });
  });

  describe('metadata access', () => {
    it('should provide read-only access to metadata', () => {
      const metadata = plugin.metadata;

      expect(metadata.id).toBe('test-plugin');
      expect(metadata.version).toBe('1.0.0');

      // Should not be able to modify
      expect(() => {
        (metadata as any).id = 'modified';
      }).toThrow();
    });

    it('should provide plugin info', () => {
      const info = plugin.getInfo();

      expect(info).toMatchObject({
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        isInitialized: false
      });
    });
  });
});