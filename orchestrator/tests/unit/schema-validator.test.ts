import { SchemaValidator } from '../../src/schema-validator.js';
import { testHelpers } from '../setup.js';

describe('SchemaValidator', () => {
  let validator: SchemaValidator;

  beforeEach(async () => {
    validator = new SchemaValidator();
    await validator.initialize();
  });

  describe('workflow validation', () => {
    it('should validate correct workflow structure', () => {
      const validWorkflow = {
        name: 'Test Workflow',
        description: 'A test workflow for validation',
        use_case: 'Testing workflow validation functionality',
        agents: {
          sequence: [
            {
              name: 'test-agent',
              description: 'Test agent for validation',
              timeout: '30m',
              required: true
            }
          ]
        },
        context: {
          template: 'Test template with {{task_description}} placeholder'
        },
        examples: [
          'Test example 1',
          'Test example 2'
        ]
      };

      const result = validator.validateWorkflow(validWorkflow);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject workflow missing required fields', () => {
      const invalidWorkflow = {
        name: 'Test Workflow',
        // Missing description, use_case, agents, context, examples
      };

      const result = validator.validateWorkflow(invalidWorkflow);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.path === 'description')).toBe(true);
      expect(result.errors.some(e => e.path === 'use_case')).toBe(true);
    });

    it('should validate parallel agent groups', () => {
      const workflowWithParallel = {
        name: 'Parallel Test',
        description: 'Testing parallel agent execution',
        use_case: 'Testing parallel execution patterns',
        agents: {
          sequence: [
            {
              type: 'parallel',
              description: 'Parallel execution group',
              agents: [
                {
                  name: 'agent-one',
                  description: 'First parallel agent',
                  timeout: '15m'
                },
                {
                  name: 'agent-two',
                  description: 'Second parallel agent',
                  timeout: '20m'
                }
              ]
            }
          ]
        },
        context: {
          template: 'Parallel test template'
        },
        examples: ['Parallel execution example']
      };

      const result = validator.validateWorkflow(workflowWithParallel);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate conditional agent groups', () => {
      const workflowWithConditional = {
        name: 'Conditional Test',
        description: 'Testing conditional agent execution',
        use_case: 'Testing conditional execution patterns',
        agents: {
          sequence: [
            {
              type: 'conditional',
              description: 'Conditional execution based on context',
              conditions: {
                backend_issue: {
                  name: 'backend-agent',
                  description: 'Handle backend issues',
                  timeout: '30m'
                },
                frontend_issue: {
                  name: 'frontend-agent',
                  description: 'Handle frontend issues',
                  timeout: '25m'
                }
              }
            }
          ]
        },
        context: {
          template: 'Conditional test template'
        },
        examples: ['Conditional execution example']
      };

      const result = validator.validateWorkflow(workflowWithConditional);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid agent names', () => {
      const workflowWithInvalidAgent = {
        name: 'Invalid Agent Test',
        description: 'Testing invalid agent name validation',
        use_case: 'Testing validation edge cases',
        agents: {
          sequence: [
            {
              name: 'Invalid Agent Name!',  // Invalid: contains space and special char
              description: 'Agent with invalid name',
              timeout: '30m'
            }
          ]
        },
        context: {
          template: 'Test template'
        },
        examples: ['Test example']
      };

      const result = validator.validateWorkflow(workflowWithInvalidAgent);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('pattern'))).toBe(true);
    });

    it('should reject invalid timeout formats', () => {
      const workflowWithInvalidTimeout = {
        name: 'Invalid Timeout Test',
        description: 'Testing invalid timeout validation',
        use_case: 'Testing timeout validation',
        agents: {
          sequence: [
            {
              name: 'test-agent',
              description: 'Agent with invalid timeout',
              timeout: 'invalid-timeout'  // Invalid format
            }
          ]
        },
        context: {
          template: 'Test template'
        },
        examples: ['Test example']
      };

      const result = validator.validateWorkflow(workflowWithInvalidTimeout);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('pattern'))).toBe(true);
    });

    it('should validate string length constraints', () => {
      const workflowWithLongName = {
        name: 'A'.repeat(200),  // Too long
        description: 'Test description',
        use_case: 'Test use case',
        agents: {
          sequence: [
            {
              name: 'test-agent',
              description: 'Test agent',
              timeout: '30m'
            }
          ]
        },
        context: {
          template: 'Test template'
        },
        examples: ['Test example']
      };

      const result = validator.validateWorkflow(workflowWithLongName);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('too long'))).toBe(true);
    });

    it('should reject empty agent sequences', () => {
      const workflowWithEmptySequence = {
        name: 'Empty Sequence Test',
        description: 'Testing empty agent sequence',
        use_case: 'Testing validation edge cases',
        agents: {
          sequence: []  // Empty sequence
        },
        context: {
          template: 'Test template'
        },
        examples: ['Test example']
      };

      const result = validator.validateWorkflow(workflowWithEmptySequence);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('minItems'))).toBe(true);
    });
  });

  describe('agent validation', () => {
    it('should validate correct agent structure', () => {
      const validAgent = {
        frontmatter: {
          name: 'test-agent',
          description: 'A comprehensive test agent for validation purposes with detailed capabilities and usage instructions',
          model: 'opus',
          version: '1.0.0',
          tags: ['testing', 'validation'],
          capabilities: ['workflow validation', 'test execution'],
          timeout: {
            default: '30m',
            max: '2h'
          }
        },
        content: 'Detailed agent prompt content with instructions and examples for proper agent behavior'
      };

      const result = validator.validateAgent(validAgent);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject agent missing required frontmatter fields', () => {
      const invalidAgent = {
        frontmatter: {
          name: 'test-agent'
          // Missing description
        },
        content: 'Agent content'
      };

      const result = validator.validateAgent(invalidAgent);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'frontmatter.description')).toBe(true);
    });

    it('should validate agent tag constraints', () => {
      const agentWithInvalidTags = {
        frontmatter: {
          name: 'test-agent',
          description: 'Agent with invalid tags for testing validation',
          tags: ['invalid-tag', 'testing']  // invalid-tag is not in enum
        },
        content: 'Agent content with sufficient length for validation'
      };

      const result = validator.validateAgent(agentWithInvalidTags);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('not in allowed list'))).toBe(true);
    });

    it('should validate content length constraints', () => {
      const agentWithShortContent = {
        frontmatter: {
          name: 'test-agent',
          description: 'Agent with content that is too short for validation requirements'
        },
        content: 'Short'  // Too short
      };

      const result = validator.validateAgent(agentWithShortContent);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('too short'))).toBe(true);
    });
  });

  describe('error reporting', () => {
    it('should provide detailed error paths', () => {
      const invalidData = {
        name: 'Test',
        description: 'Test description',
        use_case: 'Test use case',
        agents: {
          sequence: [
            {
              // Missing name, description, timeout
            }
          ]
        },
        context: {
          template: 'Test template'
        },
        examples: ['Test example']
      };

      const result = validator.validateWorkflow(invalidData);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('agents.sequence[0].name'))).toBe(true);
      expect(result.errors.some(e => e.path.includes('agents.sequence[0].description'))).toBe(true);
    });

    it('should provide helpful error messages', () => {
      const invalidData = {
        name: '',  // Too short
        description: 'Test description',
        use_case: 'Test use case',
        agents: {
          sequence: [
            {
              name: 'test-agent',
              description: 'Test description',
              timeout: '30m'
            }
          ]
        },
        context: {
          template: 'Test template'
        },
        examples: ['Test example']
      };

      const result = validator.validateWorkflow(invalidData);

      expect(result.valid).toBe(false);
      const nameError = result.errors.find(e => e.path === 'name');
      expect(nameError?.message).toContain('too short');
      expect(nameError?.expected).toContain('>=');
    });
  });
});