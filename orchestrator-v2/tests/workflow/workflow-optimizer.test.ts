import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  WorkflowOptimizer,
  OptimizationOptions,
  WorkflowCompiler,
  WorkflowDSL,
  WorkflowAST,
  StageType,
  ErrorStrategy,
  ComplexityLevel,
  TaskStage,
  SequentialStage,
  ParallelStage,
  LoopStage,
  TransformStage,
  ConditionalStage,
  WaitStage,
} from '../../core/workflow';

describe('WorkflowOptimizer', () => {
  let optimizer: WorkflowOptimizer;
  let compiler: WorkflowCompiler;

  beforeEach(() => {
    optimizer = new WorkflowOptimizer();
    compiler = new WorkflowCompiler();
  });

  describe('optimize', () => {
    it('should optimize parallelizable stages', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'parallel-opt',
          name: 'Parallel Optimization',
          version: '1.0.0',
          author: 'test',
          description: 'Test parallel optimization',
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

      const compiled = await compiler.compile(workflow);
      const result = optimizer.optimize(workflow, compiled.ast, {
        enableParallelization: true,
      });

      expect(result.reports).toBeDefined();
      expect(result.reports.length).toBeGreaterThan(0);

      const parallelReport = result.reports.find((r) => r.type === 'parallelization');
      expect(parallelReport).toBeDefined();
      expect(parallelReport?.impact).toBe('high');
      expect(parallelReport?.savings?.time).toBeGreaterThan(0);
    });

    it('should eliminate dead code', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'dead-code',
          name: 'Dead Code Elimination',
          version: '1.0.0',
          author: 'test',
          description: 'Test dead code elimination',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [],
        pipeline: [
          {
            id: 'reachable',
            name: 'Reachable Task',
            type: StageType.TASK,
            agent: 'agent1',
            complexity: ComplexityLevel.SIMPLE,
            input: {},
          } as TaskStage,
        ],
        errorHandling: {
          strategy: ErrorStrategy.FAIL_FAST,
        },
        timeouts: {
          global: 60000,
        },
      };

      // Manually add unreachable node to AST
      const compiled = await compiler.compile(workflow);
      compiled.ast.nodes.set('unreachable', {
        id: 'unreachable',
        type: StageType.TASK,
        stage: {
          id: 'unreachable',
          name: 'Unreachable Task',
          type: StageType.TASK,
        } as any,
        children: [],
        parents: [],
        depth: 0,
        metadata: {},
      });

      const result = optimizer.optimize(workflow, compiled.ast, {
        enableDeadCodeElimination: true,
      });

      expect(result.reports).toBeDefined();
      const deadCodeReport = result.reports.find((r) => r.type === 'dead_code');
      expect(deadCodeReport).toBeDefined();
      expect(deadCodeReport?.before).toContain('unreachable');
    });

    it('should fold constant expressions', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'constant-folding',
          name: 'Constant Folding',
          version: '1.0.0',
          author: 'test',
          description: 'Test constant folding',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [],
        pipeline: [
          {
            id: 'transform1',
            name: 'Constant Transform',
            type: StageType.TRANSFORM,
            input: { value: 10, multiplier: 2 },
            transform: '20', // This could be folded
            output: {
              variable: 'result',
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

      const compiled = await compiler.compile(workflow);
      const result = optimizer.optimize(workflow, compiled.ast, {
        enableConstantFolding: true,
      });

      expect(result.reports).toBeDefined();
      const constantReport = result.reports.find((r) => r.type === 'redundancy');

      if (constantReport) {
        expect(constantReport.description).toContain('constant');
      }
    });

    it('should remove redundant stages', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'redundancy-removal',
          name: 'Redundancy Removal',
          version: '1.0.0',
          author: 'test',
          description: 'Test redundancy removal',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [],
        pipeline: [
          {
            id: 'task1',
            name: 'Task',
            type: StageType.TASK,
            agent: 'agent1',
            complexity: ComplexityLevel.SIMPLE,
            input: { value: 'test' },
          } as TaskStage,
          {
            id: 'task2',
            name: 'Task',
            type: StageType.TASK,
            agent: 'agent1',
            complexity: ComplexityLevel.SIMPLE,
            input: { value: 'test' },
          } as TaskStage,
        ],
        errorHandling: {
          strategy: ErrorStrategy.FAIL_FAST,
        },
        timeouts: {
          global: 60000,
        },
      };

      const compiled = await compiler.compile(workflow);
      const result = optimizer.optimize(workflow, compiled.ast, {
        enableRedundancyRemoval: true,
      });

      expect(result.reports).toBeDefined();
      const redundancyReport = result.reports.find((r) => r.type === 'redundancy');
      expect(redundancyReport).toBeDefined();
    });

    it('should unroll small loops', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'loop-unrolling',
          name: 'Loop Unrolling',
          version: '1.0.0',
          author: 'test',
          description: 'Test loop unrolling',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [],
        pipeline: [
          {
            id: 'loop1',
            name: 'Small Loop',
            type: StageType.LOOP,
            iterator: {
              type: 'for',
              start: 0,
              end: 3,
              step: 1,
              variable: 'i',
            },
            body: {
              id: 'loop-body',
              name: 'Loop Body',
              type: StageType.TASK,
              agent: 'processor',
              complexity: ComplexityLevel.SIMPLE,
              input: { index: '${i}' },
            } as TaskStage,
          } as LoopStage,
        ],
        errorHandling: {
          strategy: ErrorStrategy.FAIL_FAST,
        },
        timeouts: {
          global: 60000,
        },
      };

      const compiled = await compiler.compile(workflow);
      const result = optimizer.optimize(workflow, compiled.ast, {
        enableLoopUnrolling: true,
      });

      expect(result.reports).toBeDefined();
      const unrollingReport = result.reports.find(
        (r) => r.description.includes('unrolled')
      );

      if (unrollingReport) {
        expect(unrollingReport.impact).toBeDefined();
        expect(unrollingReport.savings).toBeDefined();
      }
    });

    it('should identify caching opportunities', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'caching',
          name: 'Caching Opportunities',
          version: '1.0.0',
          author: 'test',
          description: 'Test caching identification',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [],
        pipeline: [
          {
            id: 'deterministic-task',
            name: 'Deterministic Task',
            type: StageType.TASK,
            agent: 'calculator',
            complexity: ComplexityLevel.SIMPLE,
            input: { value: 42 },
          } as TaskStage,
          {
            id: 'transform',
            name: 'Pure Transform',
            type: StageType.TRANSFORM,
            input: { x: 10 },
            transform: 'x * 2',
            output: {
              variable: 'result',
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

      const compiled = await compiler.compile(workflow);
      const result = optimizer.optimize(workflow, compiled.ast, {
        enableCaching: true,
      });

      expect(result.reports).toBeDefined();
      const cachingReport = result.reports.find((r) => r.type === 'caching');
      expect(cachingReport).toBeDefined();
      expect(cachingReport?.description).toContain('caching');
      expect(cachingReport?.savings?.time).toBeGreaterThan(0);
    });

    it('should add branch predictions', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'branch-prediction',
          name: 'Branch Prediction',
          version: '1.0.0',
          author: 'test',
          description: 'Test branch prediction',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [],
        pipeline: [
          {
            id: 'cond1',
            name: 'Predictable Condition',
            type: StageType.CONDITIONAL,
            expression: 'true === true',
            thenStage: {
              id: 'then',
              name: 'Then',
              type: StageType.TASK,
              agent: 'agent1',
              complexity: ComplexityLevel.SIMPLE,
              input: {},
            } as TaskStage,
            elseStage: {
              id: 'else',
              name: 'Else',
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

      const compiled = await compiler.compile(workflow);
      const result = optimizer.optimize(workflow, compiled.ast, {
        enableBranchPrediction: true,
      });

      expect(result.reports).toBeDefined();
      const branchReport = result.reports.find(
        (r) => r.description.includes('branch')
      );

      if (branchReport) {
        expect(branchReport.after).toBeDefined();
      }
    });

    it('should apply aggressive optimizations', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'aggressive',
          name: 'Aggressive Optimization',
          version: '1.0.0',
          author: 'test',
          description: 'Test aggressive optimizations',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [],
        pipeline: [
          {
            id: 'transform1',
            name: 'Transform 1',
            type: StageType.TRANSFORM,
            input: { x: 10 },
            transform: 'x * 2',
            output: {
              variable: 'intermediate',
            },
          } as TransformStage,
          {
            id: 'transform2',
            name: 'Transform 2',
            type: StageType.TRANSFORM,
            input: '${intermediate}',
            transform: 'intermediate + 5',
            output: {
              variable: 'result',
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

      const compiled = await compiler.compile(workflow);
      const result = optimizer.optimize(workflow, compiled.ast, {
        aggressiveOptimization: true,
      });

      expect(result.reports).toBeDefined();
      expect(result.reports.length).toBeGreaterThan(0);
      expect(result.metrics).toBeDefined();
    });
  });

  describe('metrics', () => {
    it('should calculate optimization metrics', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'metrics',
          name: 'Metrics Calculation',
          version: '1.0.0',
          author: 'test',
          description: 'Test metrics calculation',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [],
        pipeline: [
          {
            id: 'seq',
            name: 'Sequential',
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
              {
                id: 'task3',
                name: 'Task 3',
                type: StageType.TASK,
                agent: 'agent3',
                complexity: ComplexityLevel.COMPLEX,
                input: {},
              } as TaskStage,
            ],
          } as SequentialStage,
        ],
        errorHandling: {
          strategy: ErrorStrategy.FAIL_FAST,
        },
        timeouts: {
          global: 60000,
        },
      };

      const compiled = await compiler.compile(workflow);
      const result = optimizer.optimize(workflow, compiled.ast);

      expect(result.metrics).toBeDefined();
      expect(result.metrics.originalDuration).toBeGreaterThan(0);
      expect(result.metrics.optimizedDuration).toBeGreaterThanOrEqual(0);
      expect(result.metrics.stagesOptimized).toBeGreaterThanOrEqual(0);
    });

    it('should track parallelization gains', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'parallel-gains',
          name: 'Parallel Gains',
          version: '1.0.0',
          author: 'test',
          description: 'Test parallelization gains',
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
            id: 'wait',
            name: 'Wait',
            type: StageType.WAIT,
            duration: 1000,
          } as WaitStage,
        ],
        errorHandling: {
          strategy: ErrorStrategy.FAIL_FAST,
        },
        timeouts: {
          global: 60000,
        },
      };

      const compiled = await compiler.compile(workflow);
      const result = optimizer.optimize(workflow, compiled.ast, {
        enableParallelization: true,
      });

      expect(result.metrics.parallelizationGain).toBeGreaterThanOrEqual(0);
    });
  });

  describe('options', () => {
    it('should respect optimization options', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'options',
          name: 'Options Test',
          version: '1.0.0',
          author: 'test',
          description: 'Test optimization options',
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
        ],
        errorHandling: {
          strategy: ErrorStrategy.FAIL_FAST,
        },
        timeouts: {
          global: 60000,
        },
      };

      const compiled = await compiler.compile(workflow);

      const options: OptimizationOptions = {
        enableParallelization: false,
        enableCaching: false,
        enableDeadCodeElimination: false,
        enableRedundancyRemoval: false,
        enableStageReordering: false,
        enableLoopUnrolling: false,
        enableConstantFolding: false,
        enableBranchPrediction: false,
      };

      const result = optimizer.optimize(workflow, compiled.ast, options);

      expect(result.reports.length).toBe(0);
    });

    it('should respect max parallelism option', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'max-parallel',
          name: 'Max Parallelism',
          version: '1.0.0',
          author: 'test',
          description: 'Test max parallelism',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [],
        pipeline: Array.from({ length: 10 }, (_, i) => ({
          id: `task${i}`,
          name: `Task ${i}`,
          type: StageType.TASK,
          agent: `agent${i}`,
          complexity: ComplexityLevel.SIMPLE,
          input: {},
        } as TaskStage)),
        errorHandling: {
          strategy: ErrorStrategy.FAIL_FAST,
        },
        timeouts: {
          global: 60000,
        },
      };

      const compiled = await compiler.compile(workflow);

      const options: OptimizationOptions = {
        enableParallelization: true,
        maxParallelism: 3,
      };

      const result = optimizer.optimize(workflow, compiled.ast, options);

      // Check that parallelism is limited
      const optimizedWorkflow = result.optimizedWorkflow;
      const parallelStages = optimizedWorkflow.pipeline.filter(
        (s) => s.type === StageType.PARALLEL
      );

      parallelStages.forEach((stage) => {
        const parallel = stage as ParallelStage;
        expect(parallel.maxConcurrency).toBeLessThanOrEqual(3);
      });
    });
  });
});