import { CommandParser } from '../../src/command-parser.js';
import { WorkflowLoader } from '../../src/workflow-loader.js';
import { testHelpers } from '../setup.js';

describe('CommandParser', () => {
  let commandParser: CommandParser;
  let mockWorkflowLoader: jest.Mocked<WorkflowLoader>;

  beforeEach(() => {
    mockWorkflowLoader = {
      loadAllWorkflows: jest.fn(),
      getWorkflowNames: jest.fn(),
      loadWorkflow: jest.fn(),
      findWorkflowsByUseCase: jest.fn(),
      clearCache: jest.fn(),
      initialize: jest.fn()
    } as any;

    commandParser = new CommandParser(mockWorkflowLoader);
  });

  describe('parseCommand', () => {
    beforeEach(async () => {
      // Mock workflow patterns
      mockWorkflowLoader.loadAllWorkflows.mockResolvedValue({
        'full-feature': testHelpers.createMockWorkflow('Full Feature'),
        'backend-only': testHelpers.createMockWorkflow('Backend Only'),
        'debug-issue': testHelpers.createMockWorkflow('Debug Issue')
      });

      await commandParser.initialize();
    });

    it('should parse explicit workflow commands', async () => {
      const command = 'Run full-feature workflow: Implement user authentication';
      const result = await commandParser.parseCommand(command);

      expect(result).not.toBeNull();
      expect(result?.workflowType).toBe('full-feature');
      expect(result?.taskDescription).toBe('Implement user authentication');
      expect(result?.priority).toBe('medium');
    });

    it('should detect priority levels', async () => {
      const urgentCommand = 'CRITICAL: Fix payment system immediately';
      const result = await commandParser.parseCommand(urgentCommand);

      expect(result?.priority).toBe('critical');
    });

    it('should extract metadata from commands', async () => {
      const command = 'Optimize API to respond in under 200ms using Redis cache';
      const result = await commandParser.parseCommand(command);

      expect(result?.metadata.performanceTarget).toEqual({
        value: 200,
        unit: 'ms'
      });
      expect(result?.metadata.technologies).toContain('redis');
    });

    it('should handle semantic workflow identification', async () => {
      const command = 'Fix the API returning 500 errors';
      const result = await commandParser.parseCommand(command);

      expect(result?.workflowType).toBe('debug-issue');
    });

    it('should return null for unrecognizable commands', async () => {
      const command = 'Random nonsense that makes no sense';
      const result = await commandParser.parseCommand(command);

      expect(result).toBeNull();
    });
  });

  describe('suggestWorkflows', () => {
    beforeEach(async () => {
      mockWorkflowLoader.loadAllWorkflows.mockResolvedValue({
        'full-feature': {
          name: 'Full Feature Development',
          description: 'Complete feature implementation from design to deployment',
          use_case: 'New features requiring both backend and frontend work',
          examples: ['Implement JWT authentication', 'Build shopping cart'],
          agents: { sequence: [] },
          context: { template: '' }
        },
        'backend-only': {
          name: 'Backend Development',
          description: 'Server-side changes and API development',
          use_case: 'Backend services, APIs, and database work',
          examples: ['Add Redis caching', 'Create REST endpoints'],
          agents: { sequence: [] },
          context: { template: '' }
        }
      });

      await commandParser.initialize();
    });

    it('should suggest relevant workflows', async () => {
      const command = 'I need to add authentication';
      const suggestions = await commandParser.suggestWorkflows(command);

      expect(suggestions.length).toBeGreaterThanOrEqual(1);
      expect(suggestions[0].workflowType).toBe('full-feature');
      expect(suggestions[0].confidence).toBeGreaterThan(0);
    });

    it('should rank suggestions by confidence', async () => {
      const command = 'Add caching to improve performance';
      const suggestions = await commandParser.suggestWorkflows(command);

      // Should be sorted by confidence (highest first)
      for (let i = 1; i < suggestions.length; i++) {
        expect(suggestions[i-1].confidence).toBeGreaterThanOrEqual(suggestions[i].confidence);
      }
    });

    it('should provide meaningful reasons for suggestions', async () => {
      const command = 'authentication JWT tokens';
      const suggestions = await commandParser.suggestWorkflows(command);

      expect(suggestions[0].reason).toContain('example');
    });
  });

  describe('edge cases', () => {
    it('should handle empty commands gracefully', async () => {
      const result = await commandParser.parseCommand('');
      expect(result).toBeNull();
    });

    it('should handle very long commands', async () => {
      const longCommand = 'a'.repeat(1000);
      const result = await commandParser.parseCommand(longCommand);
      expect(result).toBeNull();
    });

    it('should handle special characters in commands', async () => {
      const command = 'Fix API with @#$%^&*() special chars';
      const result = await commandParser.parseCommand(command);
      // Should not throw an error
      expect(result).toBeDefined();
    });
  });
});