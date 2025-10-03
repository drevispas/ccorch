import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  WorkflowParser,
  ParserOptions,
  WorkflowDSL,
  StageType,
  ErrorStrategy,
  ComplexityLevel,
} from '../../core/workflow';

describe('WorkflowParser', () => {
  let parser: WorkflowParser;
  let testDir: string;

  beforeEach(async () => {
    parser = new WorkflowParser();
    testDir = path.join('/tmp', 'workflow-parser-test-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('parseString', () => {
    it('should parse JSON workflow', async () => {
      const jsonWorkflow = JSON.stringify({
        metadata: {
          id: 'json-workflow',
          name: 'JSON Workflow',
          version: '1.0.0',
          author: 'test',
          description: 'Test JSON workflow',
          tags: ['test'],
        },
        variables: [
          {
            name: 'input',
            type: 'string',
            defaultValue: 'test',
          },
        ],
        pipeline: [
          {
            id: 'task1',
            name: 'Task 1',
            type: 'TASK',
            agent: 'test-agent',
            complexity: 'simple',
            input: { value: '${input}' },
          },
        ],
        errorHandling: {
          strategy: 'FAIL_FAST',
        },
        timeouts: {
          global: 60000,
        },
      });

      const result = await parser.parseString(jsonWorkflow, 'json');

      expect(result.workflow).toBeDefined();
      expect(result.workflow.metadata.id).toBe('json-workflow');
      expect(result.source).toBe('json');
      expect(result.warnings).toEqual([]);
    });

    it('should parse YAML workflow', async () => {
      const yamlWorkflow = `
metadata:
  id: yaml-workflow
  name: YAML Workflow
  version: 1.0.0
  author: test
  description: Test YAML workflow
  tags:
    - test
    - yaml

variables:
  - name: input
    type: string
    defaultValue: test

pipeline:
  - id: task1
    name: Task 1
    type: TASK
    agent: test-agent
    complexity: simple
    input:
      value: \${input}

errorHandling:
  strategy: FAIL_FAST

timeouts:
  global: 60000
`;

      const result = await parser.parseString(yamlWorkflow, 'yaml');

      expect(result.workflow).toBeDefined();
      expect(result.workflow.metadata.id).toBe('yaml-workflow');
      expect(result.source).toBe('yaml');
      expect(result.workflow.metadata.tags).toContain('yaml');
    });

    it('should auto-detect JSON format', async () => {
      const jsonWorkflow = JSON.stringify({
        metadata: { id: 'auto-json' },
        variables: [],
        pipeline: [],
        errorHandling: { strategy: 'FAIL_FAST' },
        timeouts: { global: 60000 },
      });

      const result = await parser.parseString(jsonWorkflow, 'auto');

      expect(result.source).toBe('json');
      expect(result.workflow.metadata.id).toBe('auto-json');
    });

    it('should auto-detect YAML format', async () => {
      const yamlWorkflow = `
metadata:
  id: auto-yaml
variables: []
pipeline: []
errorHandling:
  strategy: FAIL_FAST
timeouts:
  global: 60000
`;

      const result = await parser.parseString(yamlWorkflow, 'auto');

      expect(result.source).toBe('yaml');
      expect(result.workflow.metadata.id).toBe('auto-yaml');
    });

    it('should handle parsing errors gracefully', async () => {
      const invalidJson = '{ invalid json }';

      await expect(parser.parseString(invalidJson, 'json')).rejects.toThrow();
    });
  });

  describe('parseFile', () => {
    it('should parse JSON file', async () => {
      const workflow = {
        metadata: {
          id: 'file-json',
          name: 'File JSON',
          version: '1.0.0',
          author: 'test',
          description: 'Test file JSON',
          tags: [],
        },
        variables: [],
        pipeline: [],
        errorHandling: { strategy: 'FAIL_FAST' },
        timeouts: { global: 60000 },
      };

      const filePath = path.join(testDir, 'workflow.json');
      await fs.writeFile(filePath, JSON.stringify(workflow, null, 2));

      const result = await parser.parseFile(filePath);

      expect(result.workflow.metadata.id).toBe('file-json');
      expect(result.source).toBe('json');
      expect(result.metadata.fileSize).toBeGreaterThan(0);
    });

    it('should parse YAML file', async () => {
      const yamlContent = `
metadata:
  id: file-yaml
  name: File YAML
  version: 1.0.0
  author: test
  description: Test file YAML
  tags: []
variables: []
pipeline: []
errorHandling:
  strategy: FAIL_FAST
timeouts:
  global: 60000
`;

      const filePath = path.join(testDir, 'workflow.yaml');
      await fs.writeFile(filePath, yamlContent);

      const result = await parser.parseFile(filePath);

      expect(result.workflow.metadata.id).toBe('file-yaml');
      expect(result.source).toBe('yaml');
    });
  });

  describe('transformers', () => {
    it('should normalize metadata', async () => {
      const workflow = {
        // Missing metadata fields
        variables: [],
        pipeline: [],
        errorHandling: { strategy: 'FAIL_FAST' },
        timeouts: 60000,
      };

      const result = await parser.parseString(JSON.stringify(workflow), 'json');

      expect(result.workflow.metadata).toBeDefined();
      expect(result.workflow.metadata.id).toBeDefined();
      expect(result.workflow.metadata.name).toBeDefined();
      expect(result.workflow.metadata.version).toBe('1.0.0');
      expect(result.workflow.metadata.author).toBe('unknown');
    });

    it('should convert shorthand notations', async () => {
      const workflow = {
        metadata: { id: 'shorthand' },
        variables: ['var1', 'var2'], // Shorthand
        pipeline: [
          'agent1:simple', // Shorthand task
          {
            stages: [
              'agent2:moderate',
              'agent3:complex',
            ],
            parallel: true,
          },
        ],
        errorHandling: 'FAIL_FAST', // Shorthand
        timeouts: 60000, // Shorthand
      };

      const result = await parser.parseString(JSON.stringify(workflow), 'json');

      // Variables expanded
      expect(result.workflow.variables.length).toBe(2);
      expect(result.workflow.variables[0].name).toBe('var1');
      expect(result.workflow.variables[0].type).toBe('any');

      // Pipeline expanded
      expect(result.workflow.pipeline.length).toBe(2);
      expect(result.workflow.pipeline[0].type).toBe(StageType.TASK);

      // Error handling expanded
      expect(result.workflow.errorHandling.strategy).toBeDefined();

      // Timeouts expanded
      expect(result.workflow.timeouts.global).toBe(60000);
    });

    it('should expand variable shorthands', async () => {
      const workflow = {
        metadata: { id: 'var-shorthand' },
        variables: {
          stringVar: 'default value',
          numberVar: 42,
          booleanVar: true,
          objectVar: { key: 'value' },
          arrayVar: [1, 2, 3],
        },
        pipeline: [],
        errorHandling: { strategy: 'FAIL_FAST' },
        timeouts: { global: 60000 },
      };

      const result = await parser.parseString(JSON.stringify(workflow), 'json');

      const variables = result.workflow.variables;
      expect(variables.length).toBe(5);

      const stringVar = variables.find((v) => v.name === 'stringVar');
      expect(stringVar?.type).toBe('string');
      expect(stringVar?.defaultValue).toBe('default value');

      const numberVar = variables.find((v) => v.name === 'numberVar');
      expect(numberVar?.type).toBe('number');
      expect(numberVar?.defaultValue).toBe(42);

      const booleanVar = variables.find((v) => v.name === 'booleanVar');
      expect(booleanVar?.type).toBe('boolean');
      expect(booleanVar?.defaultValue).toBe(true);

      const objectVar = variables.find((v) => v.name === 'objectVar');
      expect(objectVar?.type).toBe('object');

      const arrayVar = variables.find((v) => v.name === 'arrayVar');
      expect(arrayVar?.type).toBe('array');
    });

    it('should infer stage types', async () => {
      const workflow = {
        metadata: { id: 'infer-types' },
        variables: [],
        pipeline: [
          {
            id: 'task',
            agent: 'test-agent',
            complexity: 'simple',
            input: {},
          },
          {
            id: 'sequential',
            stages: ['agent1:simple', 'agent2:moderate'],
          },
          {
            id: 'parallel',
            stages: ['agent3:simple', 'agent4:simple'],
            parallel: true,
          },
          {
            id: 'conditional',
            expression: 'true',
            thenStage: 'agent5:simple',
          },
          {
            id: 'loop',
            iterator: { type: 'for', start: 0, end: 10 },
            body: 'agent6:simple',
          },
          {
            id: 'transform',
            transform: 'x * 2',
            output: { variable: 'result' },
          },
          {
            id: 'wait',
            duration: 1000,
          },
        ],
        errorHandling: { strategy: 'FAIL_FAST' },
        timeouts: { global: 60000 },
      };

      const result = await parser.parseString(JSON.stringify(workflow), 'json');

      const pipeline = result.workflow.pipeline;
      expect(pipeline[0].type).toBe(StageType.TASK);
      expect(pipeline[1].type).toBe(StageType.SEQUENTIAL);
      expect(pipeline[2].type).toBe(StageType.PARALLEL);
      expect(pipeline[3].type).toBe(StageType.CONDITIONAL);
      expect(pipeline[4].type).toBe(StageType.LOOP);
      expect(pipeline[5].type).toBe(StageType.TRANSFORM);
      expect(pipeline[6].type).toBe(StageType.WAIT);
    });
  });

  describe('includes', () => {
    it('should resolve includes in JSON', async () => {
      const includedWorkflow = {
        id: 'included-task',
        name: 'Included Task',
        type: 'TASK',
        agent: 'included-agent',
        complexity: 'simple',
        input: {},
      };

      const mainWorkflow = {
        metadata: { id: 'main-with-include' },
        variables: [],
        pipeline: [
          { $include: './included.json' },
        ],
        errorHandling: { strategy: 'FAIL_FAST' },
        timeouts: { global: 60000 },
      };

      const includedPath = path.join(testDir, 'included.json');
      const mainPath = path.join(testDir, 'main.json');

      await fs.writeFile(includedPath, JSON.stringify(includedWorkflow));
      await fs.writeFile(mainPath, JSON.stringify(mainWorkflow));

      const parserWithIncludes = new WorkflowParser({
        resolveIncludes: true,
        baseDir: testDir,
      });

      const result = await parserWithIncludes.parseFile(mainPath);

      expect(result.workflow.pipeline.length).toBe(1);
      expect(result.workflow.pipeline[0].id).toBe('included-task');
      expect(result.metadata.includes).toContain(includedPath);
    });

    it('should handle missing includes gracefully', async () => {
      const workflow = {
        metadata: { id: 'missing-include' },
        variables: [],
        pipeline: [
          { $include: './nonexistent.json' },
        ],
        errorHandling: { strategy: 'FAIL_FAST' },
        timeouts: { global: 60000 },
      };

      const filePath = path.join(testDir, 'workflow.json');
      await fs.writeFile(filePath, JSON.stringify(workflow));

      const parserNonStrict = new WorkflowParser({
        resolveIncludes: true,
        strict: false,
        baseDir: testDir,
      });

      const result = await parserNonStrict.parseFile(filePath);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].message).toContain('Failed to include');
    });
  });

  describe('validation', () => {
    it('should validate workflow schema', async () => {
      const invalidWorkflow = {
        metadata: { id: 'invalid' },
        // Missing required fields
      };

      const parserStrict = new WorkflowParser({
        validateSchema: true,
        strict: true,
      });

      await expect(
        parserStrict.parseString(JSON.stringify(invalidWorkflow), 'json')
      ).rejects.toThrow('validation failed');
    });

    it('should collect validation warnings in non-strict mode', async () => {
      const invalidWorkflow = {
        metadata: { id: 'invalid' },
        // Missing required fields
      };

      const parserNonStrict = new WorkflowParser({
        validateSchema: true,
        strict: false,
      });

      const result = await parserNonStrict.parseString(
        JSON.stringify(invalidWorkflow),
        'json'
      );

      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('serialization', () => {
    it('should serialize to JSON', () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'serialize-json',
          name: 'Serialize JSON',
          version: '1.0.0',
          author: 'test',
          description: 'Test serialization',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [],
        pipeline: [],
        errorHandling: {
          strategy: ErrorStrategy.FAIL_FAST,
        },
        timeouts: {
          global: 60000,
        },
      };

      const json = parser.serializeToJSON(workflow);
      const parsed = JSON.parse(json);

      expect(parsed.metadata.id).toBe('serialize-json');
      expect(parsed.errorHandling.strategy).toBe('fail_fast');
    });

    it('should serialize to YAML', () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'serialize-yaml',
          name: 'Serialize YAML',
          version: '1.0.0',
          author: 'test',
          description: 'Test serialization',
          tags: ['test', 'yaml'],
          created: new Date(),
          updated: new Date(),
        },
        variables: [],
        pipeline: [],
        errorHandling: {
          strategy: ErrorStrategy.RETRY,
        },
        timeouts: {
          global: 10000,
        },
      };

      const yaml = parser.serializeToYAML(workflow);

      expect(yaml).toContain('id: serialize-yaml');
      expect(yaml).toContain('strategy: retry');
      expect(yaml).toContain('- test');
      expect(yaml).toContain('- yaml');
    });

    it('should serialize to file', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'serialize-file',
          name: 'Serialize File',
          version: '1.0.0',
          author: 'test',
          description: 'Test file serialization',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [],
        pipeline: [],
        errorHandling: {
          strategy: ErrorStrategy.CONTINUE,
        },
        timeouts: {
          global: 60000,
        },
      };

      const jsonPath = path.join(testDir, 'serialized.json');
      const yamlPath = path.join(testDir, 'serialized.yaml');

      await parser.serializeToFile(workflow, jsonPath, 'json');
      await parser.serializeToFile(workflow, yamlPath, 'yaml');

      const jsonContent = await fs.readFile(jsonPath, 'utf-8');
      const yamlContent = await fs.readFile(yamlPath, 'utf-8');

      expect(JSON.parse(jsonContent).metadata.id).toBe('serialize-file');
      expect(yamlContent).toContain('id: serialize-file');
    });
  });

  describe('custom transformers', () => {
    it('should apply custom transformers', async () => {
      const customTransformer = {
        name: 'custom-transform',
        priority: 10,
        transform: (workflow: any) => {
          workflow.customField = 'transformed';
          return workflow;
        },
      };

      const parserWithTransformer = new WorkflowParser({
        transformers: [customTransformer],
      });

      const workflow = {
        metadata: { id: 'custom' },
        variables: [],
        pipeline: [],
        errorHandling: { strategy: 'FAIL_FAST' },
        timeouts: { global: 60000 },
      };

      const result = await parserWithTransformer.parseString(
        JSON.stringify(workflow),
        'json'
      );

      expect((result.workflow as any).customField).toBe('transformed');
    });

    it('should apply transformers in priority order', async () => {
      const order: string[] = [];

      const transformer1 = {
        name: 'transformer1',
        priority: 20,
        transform: (workflow: any) => {
          order.push('transformer1');
          return workflow;
        },
      };

      const transformer2 = {
        name: 'transformer2',
        priority: 10,
        transform: (workflow: any) => {
          order.push('transformer2');
          return workflow;
        },
      };

      const parserWithTransformers = new WorkflowParser({
        transformers: [transformer1, transformer2],
      });

      const workflow = {
        metadata: { id: 'priority' },
        variables: [],
        pipeline: [],
        errorHandling: { strategy: 'FAIL_FAST' },
        timeouts: { global: 60000 },
      };

      await parserWithTransformers.parseString(JSON.stringify(workflow), 'json');

      expect(order).toEqual(['transformer2', 'transformer1']);
    });
  });
});