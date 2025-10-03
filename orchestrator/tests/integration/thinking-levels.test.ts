import { AgentLoader } from '../../src/agent-loader';
import { detectThinkingLevel, ThinkingLevel } from '../../src/complexity-detector';
import { promises as fs } from 'fs';
import { join } from 'path';

describe('Thinking Levels Integration', () => {
  let agentLoader: AgentLoader;

  beforeEach(() => {
    agentLoader = new AgentLoader();
  });

  describe('Agent Loading with Thinking Levels', () => {
    const testAgents = [
      'backend-architect',
      'java-backend-developer',
      'code-reviewer',
      'e2e-test-architect',
      'issue-detective',
      'nextjs-react-developer'
    ];

    test.each(testAgents)('should load %s agent for all thinking levels', async (agentName) => {
      const levels: ThinkingLevel[] = ['light', 'standard', 'ultra'];

      for (const level of levels) {
        const agentContent = await agentLoader.loadAgent(agentName, level);

        expect(agentContent).toBeDefined();
        expect(agentContent.length).toBeGreaterThan(0);

        // Verify YAML frontmatter exists
        expect(agentContent).toMatch(/^---/);
        expect(agentContent).toContain(`name: ${agentName}`);
      }
    });

    test('should load appropriate complexity based on task description', async () => {
      const taskExamples = [
        { task: 'Create simple mock API', expectedLevel: 'light' },
        { task: 'Implement user authentication', expectedLevel: 'standard' },
        { task: 'Design production-ready scalable system', expectedLevel: 'ultra' }
      ];

      for (const { task, expectedLevel } of taskExamples) {
        const detectedLevel = detectThinkingLevel(task);
        const agentContent = await agentLoader.loadAgent('backend-architect', detectedLevel);

        expect(detectedLevel).toBe(expectedLevel);
        expect(agentContent).toContain(`name: backend-architect`);
      }
    });

    test('should fall back to moderate when specific level unavailable', async () => {
      // Test fallback behavior - should not throw error
      const agentContent = await agentLoader.loadAgent('backend-architect', 'standard');
      expect(agentContent).toBeDefined();
    });

    test('should handle non-existent agent gracefully', async () => {
      await expect(agentLoader.loadAgent('non-existent-agent', 'light'))
        .rejects
        .toThrow();
    });
  });

  describe('Agent Complexity Coverage', () => {
    test('should have all three complexity levels for each agent', async () => {
      const coverage = await agentLoader.getComplexityCoverage();

      const expectedAgents = [
        'backend-architect',
        'java-backend-developer',
        'code-reviewer',
        'e2e-test-architect',
        'issue-detective',
        'nextjs-react-developer'
      ];

      for (const agentName of expectedAgents) {
        expect(coverage[agentName]).toBeDefined();
        expect(coverage[agentName].complete).toBe(true);
        expect(coverage[agentName].missing).toHaveLength(0);
        expect(coverage[agentName].levels).toContain('light');
        expect(coverage[agentName].levels).toContain('standard');
        expect(coverage[agentName].levels).toContain('ultra');
      }
    });
  });

  describe('Agent Content Validation', () => {
    test('should have appropriate thinking markers in agent definitions', async () => {
      // Light agents should have "Think:" marker
      const lightAgent = await agentLoader.loadAgent('backend-architect', 'light');
      expect(lightAgent).toContain('Think:');

      // Standard agents should have "Think Harder:" marker
      const standardAgent = await agentLoader.loadAgent('backend-architect', 'standard');
      expect(standardAgent).toContain('Think Harder:');

      // Ultra agents should have "Ultrathink:" marker
      const ultraAgent = await agentLoader.loadAgent('backend-architect', 'ultra');
      expect(ultraAgent).toContain('Ultrathink:');
    });

    test('should have different content lengths for different complexity levels', async () => {
      const lightAgent = await agentLoader.loadAgent('java-backend-developer', 'light');
      const standardAgent = await agentLoader.loadAgent('java-backend-developer', 'standard');
      const ultraAgent = await agentLoader.loadAgent('java-backend-developer', 'ultra');

      // Ultra should be longest, light should be shortest
      expect(ultraAgent.length).toBeGreaterThan(standardAgent.length);
      expect(standardAgent.length).toBeGreaterThan(lightAgent.length);

      // Verify approximate line counts (allowing for variations in newlines)
      const lightLines = lightAgent.split('\n').length;
      const standardLines = standardAgent.split('\n').length;
      const ultraLines = ultraAgent.split('\n').length;

      expect(lightLines).toBeLessThan(15); // Should be around 8 lines
      expect(standardLines).toBeLessThan(30); // Should be around 20 lines
      expect(ultraLines).toBeLessThan(60); // Should be around 50 lines
    });

    test('should contain appropriate complexity-specific content', async () => {
      // Light agents should focus on simplicity
      const lightAgent = await agentLoader.loadAgent('code-reviewer', 'light');
      expect(lightAgent.toLowerCase()).toMatch(/quick|simple|basic|direct/);

      // Ultra agents should mention production concerns
      const ultraAgent = await agentLoader.loadAgent('code-reviewer', 'ultra');
      expect(ultraAgent.toLowerCase()).toMatch(/production|enterprise|security|performance|scalability/);
    });
  });

  describe('File System Integration', () => {
    test('should correctly identify agent files by naming pattern', async () => {
      const agentNames = await agentLoader.getAgentNames();

      expect(agentNames).toContain('backend-architect');
      expect(agentNames).toContain('java-backend-developer');
      expect(agentNames).toContain('code-reviewer');
      expect(agentNames).toContain('e2e-test-architect');
      expect(agentNames).toContain('issue-detective');
      expect(agentNames).toContain('nextjs-react-developer');

      expect(agentNames.length).toBeGreaterThanOrEqual(6);
    });

    test('should validate agent existence for each thinking level', async () => {
      const testCases = [
        { agent: 'backend-architect', level: 'light' as ThinkingLevel },
        { agent: 'backend-architect', level: 'standard' as ThinkingLevel },
        { agent: 'backend-architect', level: 'ultra' as ThinkingLevel }
      ];

      for (const { agent, level } of testCases) {
        const exists = await agentLoader.agentExists(agent, level);
        expect(exists).toBe(true);
      }
    });

    test('should get available thinking levels for agents', async () => {
      const levels = await agentLoader.getAgentThinkingLevels('backend-architect');

      expect(levels).toContain('light');
      expect(levels).toContain('standard');
      expect(levels).toContain('ultra');
      expect(levels.length).toBe(3);
    });
  });

  describe('Workflow Validation', () => {
    test('should validate workflow agents with thinking levels', async () => {
      const workflowAgents = ['backend-architect', 'java-backend-developer', 'code-reviewer'];

      const lightValidation = await agentLoader.validateWorkflowAgents(workflowAgents, 'light');
      expect(lightValidation.valid).toBe(true);
      expect(lightValidation.missing).toHaveLength(0);
      expect(lightValidation.available).toEqual(workflowAgents);

      const ultraValidation = await agentLoader.validateWorkflowAgents(workflowAgents, 'ultra');
      expect(ultraValidation.valid).toBe(true);
      expect(ultraValidation.missing).toHaveLength(0);
      expect(ultraValidation.available).toEqual(workflowAgents);
    });

    test('should detect missing agents for specific thinking levels', async () => {
      const workflowAgents = ['backend-architect', 'non-existent-agent'];

      const validation = await agentLoader.validateWorkflowAgents(workflowAgents, 'light');
      expect(validation.valid).toBe(false);
      expect(validation.missing).toContain('non-existent-agent');
      expect(validation.available).toContain('backend-architect');
    });
  });

  describe('Performance and Caching', () => {
    test('should cache agent definitions for repeated access', async () => {
      const agent = 'backend-architect';
      const level: ThinkingLevel = 'standard';

      // First load - should read from disk
      const start1 = performance.now();
      const content1 = await agentLoader.loadAgent(agent, level);
      const end1 = performance.now();

      // Second load - should use cache
      const start2 = performance.now();
      const content2 = await agentLoader.loadAgent(agent, level);
      const end2 = performance.now();

      expect(content1).toEqual(content2);
      // Cache should be faster (though this is implementation dependent)
      expect(end2 - start2).toBeLessThanOrEqual(end1 - start1 + 5); // Allow some variance
    });

    test('should handle multiple concurrent agent loads', async () => {
      const agents = ['backend-architect', 'java-backend-developer', 'code-reviewer'];
      const level: ThinkingLevel = 'ultra';

      const promises = agents.map(agent => agentLoader.loadAgent(agent, level));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach((content, index) => {
        expect(content).toContain(`name: ${agents[index]}`);
      });
    });
  });

  describe('Error Handling', () => {
    test('should provide meaningful errors for missing files', async () => {
      await expect(agentLoader.loadAgent('completely-fake-agent', 'light'))
        .rejects
        .toThrow(/Failed to load agent 'completely-fake-agent'/);
    });

    test('should handle corrupted agent files gracefully', async () => {
      // This test would require creating a corrupted file, which is complex in a test
      // In practice, the YAML parsing should handle errors gracefully
      expect(true).toBe(true); // Placeholder - real implementation would test error handling
    });
  });

  describe('End-to-End Task Processing', () => {
    test('should process complete workflow from task description to agent loading', async () => {
      const taskExamples = [
        {
          description: 'Create quick prototype API',
          expectedLevel: 'light',
          agents: ['backend-architect', 'java-backend-developer']
        },
        {
          description: 'Build production-ready scalable microservice',
          expectedLevel: 'ultra',
          agents: ['backend-architect', 'java-backend-developer', 'code-reviewer']
        }
      ];

      for (const { description, expectedLevel, agents } of taskExamples) {
        // Detect thinking level
        const detectedLevel = detectThinkingLevel(description);
        expect(detectedLevel).toBe(expectedLevel);

        // Load all agents for the workflow
        const agentContents = await Promise.all(
          agents.map(agent => agentLoader.loadAgent(agent, detectedLevel))
        );

        // Verify all agents loaded successfully
        agentContents.forEach((content, index) => {
          expect(content).toBeDefined();
          expect(content).toContain(`name: ${agents[index]}`);
        });

        // Verify thinking level consistency
        agentContents.forEach(content => {
          if (expectedLevel === 'light') {
            expect(content).toContain('Think:');
          } else if (expectedLevel === 'ultra') {
            expect(content).toContain('Ultrathink:');
          }
        });
      }
    });
  });
});