import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  WorkflowCompiler,
  WorkflowDSL,
  StageType,
  ErrorStrategy,
  ComplexityLevel,
  TaskStage,
  SequentialStage,
  ParallelStage,
  ConditionalStage,
  LoopStage,
  TransformStage,
} from '../../core/workflow';
import { EventDrivenStateManager } from '../../core/state/event-driven-state-manager';
import { PluginManager } from '../../core/plugins/plugin-manager';

describe('WorkflowCompiler', () => {
  let compiler: WorkflowCompiler;
  let mockStateManager: jest.Mocked<EventDrivenStateManager>;
  let mockPluginManager: jest.Mocked<PluginManager>;

  beforeEach(() => {
    mockStateManager = {
      executeCommand: jest.fn(),
      executeQuery: jest.fn(),
    } as any;

    mockPluginManager = {
      executeAgent: jest.fn(),
      loadPlugin: jest.fn(),
    } as any;

    compiler = new WorkflowCompiler({
      stateManager: mockStateManager,
      pluginManager: mockPluginManager,
    });
  });

  describe('compile', () => {
    it('should compile a simple workflow', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'test-workflow',
          name: 'Test Workflow',
          version: '1.0.0',
          author: 'test',
          description: 'Test workflow',
          tags: [],
          created: new Date(),
          updated: new Date(),
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
            type: StageType.TASK,
            agent: 'test-agent',
            complexity: ComplexityLevel.SIMPLE,
            input: { value: '${input}' },
          } as TaskStage,
        ],
        errorHandling: {
          strategy: ErrorStrategy.FAIL_FAST,
        },
        timeouts: {
          global: 60000,
        },
      };

      const result = await compiler.compile(workflow);

      expect(result).toBeDefined();
      expect(result.id).toBe('test-workflow');
      expect(result.version).toBe('1.0.0');
      expect(result.ast).toBeDefined();
      expect(result.executable).toBeDefined();
      expect(result.validationResult.valid).toBe(true);
      expect(result.compiledAt).toBeInstanceOf(Date);
    });

    it('should generate correct AST for sequential stages', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'sequential-workflow',
          name: 'Sequential Workflow',
          version: '1.0.0',
          author: 'test',
          description: 'Sequential workflow',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [],
        pipeline: [
          {
            id: 'seq1',
            name: 'Sequential Stage',
            type: StageType.SEQUENTIAL,
            stages: [
              {
                id: 'task1',
                name: 'Task 1',
                type: StageType.TASK,
                agent: 'agent1',
                complexity: ComplexityLevel.SIMPLE,
                input: {},
              } as TaskStage,
              {
                id: 'task2',
                name: 'Task 2',
                type: StageType.TASK,
                agent: 'agent2',
                complexity: ComplexityLevel.MODERATE,
                input: {},
              } as TaskStage,
            ],
          } as SequentialStage,
        ],
        errorHandling: {
          strategy: ErrorStrategy.CONTINUE,
        },
        timeouts: {
          global: 10000,
        },
      };

      const result = await compiler.compile(workflow);

      expect(result.ast.nodes.size).toBe(3); // seq1, task1, task2
      expect(result.ast.edges.size).toBeGreaterThan(0);
      expect(result.ast.nodes.has('seq1')).toBe(true);
      expect(result.ast.nodes.has('task1')).toBe(true);
      expect(result.ast.nodes.has('task2')).toBe(true);
    });

    it('should generate correct AST for parallel stages', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'parallel-workflow',
          name: 'Parallel Workflow',
          version: '1.0.0',
          author: 'test',
          description: 'Parallel workflow',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [],
        pipeline: [
          {
            id: 'par1',
            name: 'Parallel Stage',
            type: StageType.PARALLEL,
            stages: [
              {
                id: 'task1',
                name: 'Task 1',
                type: StageType.TASK,
                agent: 'agent1',
                complexity: ComplexityLevel.SIMPLE,
                input: {},
              } as TaskStage,
              {
                id: 'task2',
                name: 'Task 2',
                type: StageType.TASK,
                agent: 'agent2',
                complexity: ComplexityLevel.SIMPLE,
                input: {},
              } as TaskStage,
              {
                id: 'task3',
                name: 'Task 3',
                type: StageType.TASK,
                agent: 'agent3',
                complexity: ComplexityLevel.SIMPLE,
                input: {},
              } as TaskStage,
            ],
            maxConcurrency: 2,
          } as ParallelStage,
        ],
        errorHandling: {
          strategy: ErrorStrategy.RETRY,
        },
        timeouts: {
          global: 10000,
        },
      };

      const result = await compiler.compile(workflow);

      expect(result.ast.nodes.size).toBe(4); // par1, task1, task2, task3
      expect(result.ast.edges.has('par1')).toBe(true);

      const parEdges = result.ast.edges.get('par1');
      expect(parEdges).toBeDefined();
      expect(parEdges?.length).toBe(3);
      expect(parEdges?.every((e) => e.type === 'parallel')).toBe(true);
    });

    it('should handle conditional stages correctly', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'conditional-workflow',
          name: 'Conditional Workflow',
          version: '1.0.0',
          author: 'test',
          description: 'Conditional workflow',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [
          {
            name: 'condition',
            type: 'boolean',
            defaultValue: true,
          },
        ],
        pipeline: [
          {
            id: 'cond1',
            name: 'Conditional Stage',
            type: StageType.CONDITIONAL,
            expression: 'condition === true',
            thenStage: {
              id: 'then-task',
              name: 'Then Task',
              type: StageType.TASK,
              agent: 'agent1',
              complexity: ComplexityLevel.SIMPLE,
              input: {},
            } as TaskStage,
            elseStage: {
              id: 'else-task',
              name: 'Else Task',
              type: StageType.TASK,
              agent: 'agent2',
              complexity: ComplexityLevel.SIMPLE,
              input: {},
            } as TaskStage,
          } as ConditionalStage,
        ],
        errorHandling: {
          strategy: ErrorStrategy.FAIL_FAST,
        },
        timeouts: {
          global: 60000,
        },
      };

      const result = await compiler.compile(workflow);

      expect(result.ast.nodes.size).toBe(3); // cond1, then-task, else-task
      expect(result.ast.nodes.has('cond1')).toBe(true);
      expect(result.ast.nodes.has('then-task')).toBe(true);
      expect(result.ast.nodes.has('else-task')).toBe(true);

      const condEdges = result.ast.edges.get('cond1');
      expect(condEdges).toBeDefined();
      expect(condEdges?.length).toBe(2);
      expect(condEdges?.some((e) => e.to === 'then-task')).toBe(true);
      expect(condEdges?.some((e) => e.to === 'else-task')).toBe(true);
    });

    it('should handle loop stages correctly', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'loop-workflow',
          name: 'Loop Workflow',
          version: '1.0.0',
          author: 'test',
          description: 'Loop workflow',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [
          {
            name: 'items',
            type: 'array',
            defaultValue: [1, 2, 3],
          },
        ],
        pipeline: [
          {
            id: 'loop1',
            name: 'Loop Stage',
            type: StageType.LOOP,
            iterator: {
              type: 'foreach',
              variable: 'item',
              collection: 'items',
            },
            body: {
              id: 'loop-task',
              name: 'Loop Task',
              type: StageType.TASK,
              agent: 'processor',
              complexity: ComplexityLevel.SIMPLE,
              input: { item: '${item}' },
            } as TaskStage,
            maxIterations: 10,
          } as LoopStage,
        ],
        errorHandling: {
          strategy: ErrorStrategy.CONTINUE,
        },
        timeouts: {
          global: 10000,
        },
      };

      const result = await compiler.compile(workflow);

      expect(result.ast.nodes.size).toBe(2); // loop1, loop-task
      expect(result.ast.nodes.has('loop1')).toBe(true);
      expect(result.ast.nodes.has('loop-task')).toBe(true);

      const loopEdges = result.ast.edges.get('loop1');
      expect(loopEdges).toBeDefined();
      expect(loopEdges?.some((e) => e.type === 'loop')).toBe(true);
    });

    it('should detect circular dependencies', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'circular-workflow',
          name: 'Circular Workflow',
          version: '1.0.0',
          author: 'test',
          description: 'Circular workflow',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [],
        pipeline: [
          {
            id: 'task1',
            name: 'Task 1',
            type: StageType.TASK,
            agent: 'agent1',
            complexity: ComplexityLevel.SIMPLE,
            input: {},
            dependencies: ['task2'],
          } as TaskStage,
          {
            id: 'task2',
            name: 'Task 2',
            type: StageType.TASK,
            agent: 'agent2',
            complexity: ComplexityLevel.SIMPLE,
            input: {},
            dependencies: ['task1'],
          } as TaskStage,
        ],
        errorHandling: {
          strategy: ErrorStrategy.FAIL_FAST,
        },
        timeouts: {
          global: 60000,
        },
      };

      const result = compiler.validate(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'CIRCULAR_DEPENDENCY')).toBe(true);
    });

    it('should optimize parallelizable stages', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'optimizable-workflow',
          name: 'Optimizable Workflow',
          version: '1.0.0',
          author: 'test',
          description: 'Optimizable workflow',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [],
        pipeline: [
          {
            id: 'task1',
            name: 'Task 1',
            type: StageType.TASK,
            agent: 'agent1',
            complexity: ComplexityLevel.SIMPLE,
            input: {},
          } as TaskStage,
          {
            id: 'task2',
            name: 'Task 2',
            type: StageType.TASK,
            agent: 'agent2',
            complexity: ComplexityLevel.SIMPLE,
            input: {},
          } as TaskStage,
          {
            id: 'task3',
            name: 'Task 3',
            type: StageType.TASK,
            agent: 'agent3',
            complexity: ComplexityLevel.SIMPLE,
            input: {},
            dependencies: ['task1', 'task2'],
          } as TaskStage,
        ],
        errorHandling: {
          strategy: ErrorStrategy.FAIL_FAST,
        },
        timeouts: {
          global: 60000,
        },
      };

      const result = await compiler.compile(workflow);

      expect(result.optimizations).toBeDefined();
      expect(result.optimizations.length).toBeGreaterThan(0);

      const parallelOptimization = result.optimizations.find(
        (o) => o.type === 'parallelization'
      );

      expect(parallelOptimization).toBeDefined();
    });

    it('should create execution plan', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'execution-plan-workflow',
          name: 'Execution Plan Workflow',
          version: '1.0.0',
          author: 'test',
          description: 'Execution plan workflow',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [],
        pipeline: [
          {
            id: 'phase1-task1',
            name: 'Phase 1 Task 1',
            type: StageType.TASK,
            agent: 'agent1',
            complexity: ComplexityLevel.SIMPLE,
            input: {},
          } as TaskStage,
          {
            id: 'phase1-task2',
            name: 'Phase 1 Task 2',
            type: StageType.TASK,
            agent: 'agent2',
            complexity: ComplexityLevel.SIMPLE,
            input: {},
          } as TaskStage,
          {
            id: 'phase2-task',
            name: 'Phase 2 Task',
            type: StageType.TASK,
            agent: 'agent3',
            complexity: ComplexityLevel.COMPLEX,
            input: {},
            dependencies: ['phase1-task1', 'phase1-task2'],
          } as TaskStage,
        ],
        errorHandling: {
          strategy: ErrorStrategy.FAIL_FAST,
        },
        timeouts: {
          global: 60000,
        },
      };

      const result = await compiler.compile(workflow);

      expect(result.executable.executionPlan).toBeDefined();
      expect(result.executable.executionPlan.phases).toBeDefined();
      expect(result.executable.executionPlan.phases.length).toBeGreaterThan(0);
      expect(result.executable.executionPlan.criticalPath).toBeDefined();
      expect(result.executable.executionPlan.totalEstimatedDuration).toBeGreaterThan(0);
    });

    it('should handle transform stages', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'transform-workflow',
          name: 'Transform Workflow',
          version: '1.0.0',
          author: 'test',
          description: 'Transform workflow',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [
          {
            name: 'input',
            type: 'object',
            defaultValue: { value: 10 },
          },
        ],
        pipeline: [
          {
            id: 'transform1',
            name: 'Transform Stage',
            type: StageType.TRANSFORM,
            input: '${input}',
            transform: 'input.value * 2',
            output: {
              variable: 'doubled',
            },
          } as TransformStage,
        ],
        errorHandling: {
          strategy: ErrorStrategy.FAIL_FAST,
        },
        timeouts: {
          global: 60000,
        },
      };

      const result = await compiler.compile(workflow);

      expect(result.ast.nodes.has('transform1')).toBe(true);
      expect(result.executable.stages.has('transform1')).toBe(true);
    });
  });

  describe('validation', () => {
    it('should validate required fields', () => {
      const invalidWorkflow: any = {
        metadata: {
          id: 'invalid',
          // Missing required fields
        },
        pipeline: [],
      };

      const result = compiler.validate(invalidWorkflow);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect undefined stage references', () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'undefined-ref-workflow',
          name: 'Undefined Reference Workflow',
          version: '1.0.0',
          author: 'test',
          description: 'Undefined reference workflow',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [],
        pipeline: [
          {
            id: 'task1',
            name: 'Task 1',
            type: StageType.TASK,
            agent: 'agent1',
            complexity: ComplexityLevel.SIMPLE,
            input: {},
            dependencies: ['nonexistent-task'],
          } as TaskStage,
        ],
        errorHandling: {
          strategy: ErrorStrategy.FAIL_FAST,
        },
        timeouts: {
          global: 60000,
        },
      };

      const result = compiler.validate(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'UNDEFINED_REFERENCE')).toBe(true);
    });

    it('should detect unused variables', () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'unused-var-workflow',
          name: 'Unused Variable Workflow',
          version: '1.0.0',
          author: 'test',
          description: 'Unused variable workflow',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [
          {
            name: 'unused',
            type: 'string',
            defaultValue: 'not used',
          },
          {
            name: 'used',
            type: 'string',
            defaultValue: 'used',
          },
        ],
        pipeline: [
          {
            id: 'task1',
            name: 'Task 1',
            type: StageType.TASK,
            agent: 'agent1',
            complexity: ComplexityLevel.SIMPLE,
            input: { value: '${used}' },
          } as TaskStage,
        ],
        errorHandling: {
          strategy: ErrorStrategy.FAIL_FAST,
        },
        timeouts: {
          global: 60000,
        },
      };

      const result = compiler.validate(workflow);

      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.code === 'UNUSED_VARIABLE')).toBe(true);
      expect(result.warnings.some((w) => w.message.includes('unused'))).toBe(true);
    });

    it('should detect performance issues', () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'perf-issue-workflow',
          name: 'Performance Issue Workflow',
          version: '1.0.0',
          author: 'test',
          description: 'Performance issue workflow',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [],
        pipeline: [
          {
            id: 'loop1',
            name: 'Loop without max',
            type: StageType.LOOP,
            iterator: {
              type: 'while',
              condition: 'true',
            },
            body: {
              id: 'loop-task',
              name: 'Loop Task',
              type: StageType.TASK,
              agent: 'processor',
              complexity: ComplexityLevel.SIMPLE,
              input: {},
            } as TaskStage,
            // No maxIterations!
          } as LoopStage,
        ],
        errorHandling: {
          strategy: ErrorStrategy.FAIL_FAST,
        },
        timeouts: {
          global: 60000,
        },
      };

      const result = compiler.validate(workflow);

      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.code === 'PERFORMANCE_ISSUE')).toBe(true);
      expect(
        result.warnings.some((w) => w.message.includes('maximum iteration limit'))
      ).toBe(true);
    });
  });
});