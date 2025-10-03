import { v4 as uuidv4 } from 'uuid';
import { ContextStatus } from '../enums';
import {
  WorkflowDSL,
  WorkflowAST,
  ASTNode,
  ASTEdge,
  ExecutableWorkflow,
  ExecutableStage,
  ExecutionPlan,
  ExecutionPhase,
  CompiledWorkflow,
  PipelineStage,
  StageType,
  WorkflowContext,
  StageResult,
  ValidationResult,
  OptimizationReport,
  TaskStage,
  SequentialStage,
  ParallelStage,
  ConditionalStage,
  LoopStage,
  SubWorkflowStage,
  WaitStage,
  TransformStage,
  RuntimeConfig,
  WorkflowError,
  StageId,
  VariableName,
} from './types';
import { ValidationSeverity } from '../enums';
import { OptimizationType, ImpactLevel, EdgeType, ResultStatus } from '../enums';
import { validateWorkflowDSL } from './schemas';
import { EventDrivenStateManager } from '../state/event-driven-state-manager';
import { PluginManager } from '../plugins/plugin-manager';

export class WorkflowCompiler {
  private readonly version = '1.0.0';
  private readonly features = ['ast', 'optimization', 'validation', 'execution-plan'];
  private stateManager?: EventDrivenStateManager;
  private pluginManager?: PluginManager;

  constructor(options?: {
    stateManager?: EventDrivenStateManager;
    pluginManager?: PluginManager;
  }) {
    this.stateManager = options?.stateManager;
    this.pluginManager = options?.pluginManager;
  }

  // =====================
  // Main Compilation
  // =====================

  public async compile(workflow: WorkflowDSL): Promise<CompiledWorkflow> {
    // Validate the workflow DSL
    const validationResult = this.validate(workflow);
    if (!validationResult.valid) {
      throw new Error(
        `Workflow validation failed: ${validationResult.errors
          .map((e) => e.message)
          .join(', ')}`
      );
    }

    // Generate AST
    const ast = this.generateAST(workflow);

    // Optimize the AST
    const optimizationReports = this.optimize(ast, workflow);

    // Create executable workflow
    const executable = await this.createExecutable(workflow, ast);

    return {
      id: workflow.metadata.id,
      version: workflow.metadata.version,
      source: workflow,
      ast,
      executable,
      optimizations: optimizationReports,
      validationResult,
      compiledAt: new Date(),
      compiler: {
        version: this.version,
        features: this.features,
      },
    };
  }

  // =====================
  // Validation
  // =====================

  public validate(workflow: WorkflowDSL): ValidationResult {
    const schemaValidation = validateWorkflowDSL(workflow);
    if (!schemaValidation.valid) {
      return schemaValidation;
    }

    const errors: ValidationResult['errors'] = [];
    const warnings: ValidationResult['warnings'] = [];
    const info: ValidationResult['info'] = [];

    // Check for circular dependencies
    const circularDeps = this.detectCircularDependencies(workflow.pipeline);
    if (circularDeps.length > 0) {
      errors.push({
        code: 'CIRCULAR_DEPENDENCY',
        message: `Circular dependencies detected: ${circularDeps.join(' -> ')}`,
        path: 'pipeline',
        severity: ValidationSeverity.ERROR,
        suggestion: 'Remove circular dependencies between stages',
      });
    }

    // Check for undefined stage references
    const undefinedRefs = this.findUndefinedReferences(workflow);
    undefinedRefs.forEach((ref) => {
      errors.push({
        code: 'UNDEFINED_REFERENCE',
        message: `Stage references undefined stage: ${ref}`,
        path: 'pipeline',
        severity: ValidationSeverity.ERROR,
        suggestion: `Define stage ${ref} or remove the reference`,
      });
    });

    // Check for unused variables
    const unusedVars = this.findUnusedVariables(workflow);
    unusedVars.forEach((varName) => {
      warnings.push({
        code: 'UNUSED_VARIABLE',
        message: `Variable ${varName} is defined but never used`,
        path: `variables.${varName}`,
        severity: ValidationSeverity.WARNING,
        suggestion: 'Remove unused variable or use it in the workflow',
      });
    });

    // Check for performance issues
    const perfIssues = this.analyzePerformance(workflow);
    perfIssues.forEach((issue) => {
      warnings.push({
        code: 'PERFORMANCE_ISSUE',
        message: issue.message,
        path: issue.path,
        severity: ValidationSeverity.WARNING,
        suggestion: issue.suggestion,
      });
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      info,
    };
  }

  // =====================
  // AST Generation
  // =====================

  private generateAST(workflow: WorkflowDSL): WorkflowAST {
    const nodes = new Map<string, ASTNode>();
    const edges = new Map<string, ASTEdge[]>();
    const variables = new Map<VariableName, any>();
    const dependencies = new Map<StageId, StageId[]>();

    // Initialize variables
    workflow.variables.forEach((varDef) => {
      variables.set(varDef.name, varDef);
    });

    // Process pipeline stages
    workflow.pipeline.forEach((stage, index) => {
      this.processStageForAST(stage, nodes, edges, dependencies, 0, null);
    });

    // Connect sequential stages at root level
    const rootStages = workflow.pipeline.map((s) => s.id);
    for (let i = 0; i < rootStages.length - 1; i++) {
      this.addEdge(edges, rootStages[i], rootStages[i + 1], EdgeType.SEQUENCE);
    }

    return {
      root: nodes.get(workflow.pipeline[0]?.id) || this.createDummyNode(),
      nodes,
      edges,
      variables,
      dependencies,
    };
  }

  private processStageForAST(
    stage: PipelineStage,
    nodes: Map<string, ASTNode>,
    edges: Map<string, ASTEdge[]>,
    dependencies: Map<StageId, StageId[]>,
    depth: number,
    parent: string | null
  ): void {
    const node = this.createASTNode(stage, depth);
    nodes.set(stage.id, node);

    // Process based on stage type
    switch (stage.type) {
      case StageType.SEQUENTIAL:
        this.processSequentialStageAST(stage as SequentialStage, nodes, edges, dependencies, depth);
        break;
      case StageType.PARALLEL:
        this.processParallelStageAST(stage as ParallelStage, nodes, edges, dependencies, depth);
        break;
      case StageType.CONDITIONAL:
        this.processConditionalStageAST(stage as ConditionalStage, nodes, edges, dependencies, depth);
        break;
      case StageType.LOOP:
        this.processLoopStageAST(stage as LoopStage, nodes, edges, dependencies, depth);
        break;
      case StageType.TASK:
        const taskStage = stage as TaskStage;
        if (taskStage.dependencies) {
          dependencies.set(stage.id, taskStage.dependencies);
        }
        break;
    }

    if (parent) {
      this.addEdge(edges, parent, stage.id, EdgeType.SEQUENCE);
    }
  }

  private processSequentialStageAST(
    stage: SequentialStage,
    nodes: Map<string, ASTNode>,
    edges: Map<string, ASTEdge[]>,
    dependencies: Map<StageId, StageId[]>,
    depth: number
  ): void {
    stage.stages.forEach((childStage, index) => {
      this.processStageForAST(childStage, nodes, edges, dependencies, depth + 1, null);

      if (index > 0) {
        this.addEdge(edges, stage.stages[index - 1].id, childStage.id, EdgeType.SEQUENCE);
      }
    });

    if (stage.stages.length > 0) {
      this.addEdge(edges, stage.id, stage.stages[0].id, EdgeType.SEQUENCE);
    }
  }

  private processParallelStageAST(
    stage: ParallelStage,
    nodes: Map<string, ASTNode>,
    edges: Map<string, ASTEdge[]>,
    dependencies: Map<StageId, StageId[]>,
    depth: number
  ): void {
    stage.stages.forEach((childStage) => {
      this.processStageForAST(childStage, nodes, edges, dependencies, depth + 1, null);
      this.addEdge(edges, stage.id, childStage.id, EdgeType.PARALLEL);
    });
  }

  private processConditionalStageAST(
    stage: ConditionalStage,
    nodes: Map<string, ASTNode>,
    edges: Map<string, ASTEdge[]>,
    dependencies: Map<StageId, StageId[]>,
    depth: number
  ): void {
    this.processStageForAST(stage.thenStage, nodes, edges, dependencies, depth + 1, null);
    this.addEdge(edges, stage.id, stage.thenStage.id, EdgeType.CONDITIONAL, stage.expression);

    if (stage.elseStage) {
      this.processStageForAST(stage.elseStage, nodes, edges, dependencies, depth + 1, null);
      this.addEdge(edges, stage.id, stage.elseStage.id, EdgeType.CONDITIONAL, `!(${stage.expression})`);
    }
  }

  private processLoopStageAST(
    stage: LoopStage,
    nodes: Map<string, ASTNode>,
    edges: Map<string, ASTEdge[]>,
    dependencies: Map<StageId, StageId[]>,
    depth: number
  ): void {
    this.processStageForAST(stage.body, nodes, edges, dependencies, depth + 1, null);
    this.addEdge(edges, stage.id, stage.body.id, EdgeType.LOOP);
    this.addEdge(edges, stage.body.id, stage.id, EdgeType.LOOP, 'continue');
  }

  private createASTNode(stage: PipelineStage, depth: number): ASTNode {
    return {
      id: stage.id,
      type: stage.type,
      stage,
      children: this.getStageChildren(stage),
      parents: [],
      depth,
      metadata: {
        estimatedDuration: this.estimateStageDuration(stage),
        complexity: this.calculateStageComplexity(stage),
        parallelizable: this.isStageParallelizable(stage),
      },
    };
  }

  private createDummyNode(): ASTNode {
    return {
      id: 'dummy',
      type: StageType.TASK,
      stage: {
        id: 'dummy',
        name: 'Dummy',
        type: StageType.TASK,
      } as any,
      children: [],
      parents: [],
      depth: 0,
      metadata: {},
    };
  }

  private addEdge(
    edges: Map<string, ASTEdge[]>,
    from: string,
    to: string,
    type: EdgeType,
    condition?: string
  ): void {
    const edgeList = edges.get(from) || [];
    edgeList.push({ from, to, type, condition });
    edges.set(from, edgeList);
  }

  // =====================
  // Optimization
  // =====================

  private optimize(ast: WorkflowAST, workflow: WorkflowDSL): OptimizationReport[] {
    const reports: OptimizationReport[] = [];

    // Parallelization optimization
    const parallelizationReport = this.optimizeParallelization(ast, workflow);
    if (parallelizationReport) reports.push(parallelizationReport);

    // Dead code elimination
    const deadCodeReport = this.eliminateDeadCode(ast, workflow);
    if (deadCodeReport) reports.push(deadCodeReport);

    // Redundancy removal
    const redundancyReport = this.removeRedundancy(ast, workflow);
    if (redundancyReport) reports.push(redundancyReport);

    // Stage reordering
    const reorderingReport = this.optimizeStageOrder(ast, workflow);
    if (reorderingReport) reports.push(reorderingReport);

    // Caching opportunities
    const cachingReport = this.identifyCachingOpportunities(ast, workflow);
    if (cachingReport) reports.push(cachingReport);

    return reports;
  }

  private optimizeParallelization(ast: WorkflowAST, workflow: WorkflowDSL): OptimizationReport | null {
    const parallelizable: StageId[][] = [];
    const analyzed = new Set<StageId>();

    ast.nodes.forEach((node, id) => {
      if (!analyzed.has(id) && node.metadata.parallelizable) {
        const group = this.findParallelizableGroup(id, ast, analyzed);
        if (group.length > 1) {
          parallelizable.push(group);
        }
      }
    });

    if (parallelizable.length === 0) {
      return null;
    }

    return {
      type: OptimizationType.PARALLELIZATION,
      description: `Identified ${parallelizable.length} groups of stages that can run in parallel`,
      impact: ImpactLevel.HIGH,
      before: 'Sequential execution',
      after: parallelizable,
      savings: {
        time: this.estimateParallelizationSavings(parallelizable, ast),
      },
    };
  }

  private eliminateDeadCode(ast: WorkflowAST, workflow: WorkflowDSL): OptimizationReport | null {
    const reachable = new Set<StageId>();
    const queue = [workflow.pipeline[0]?.id].filter(Boolean);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (reachable.has(current)) continue;

      reachable.add(current);
      const edges = ast.edges.get(current) || [];
      edges.forEach((edge) => queue.push(edge.to));
    }

    const unreachable = Array.from(ast.nodes.keys()).filter((id) => !reachable.has(id));

    if (unreachable.length === 0) {
      return null;
    }

    return {
      type: OptimizationType.DEAD_CODE,
      description: `Found ${unreachable.length} unreachable stages`,
      impact: ImpactLevel.MEDIUM,
      before: unreachable,
      after: 'Removed',
      savings: {
        resources: unreachable.length,
      },
    };
  }

  private removeRedundancy(ast: WorkflowAST, workflow: WorkflowDSL): OptimizationReport | null {
    const duplicates: { original: StageId; duplicate: StageId }[] = [];
    const nodes = Array.from(ast.nodes.values());

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (this.areStagesIdentical(nodes[i].stage, nodes[j].stage)) {
          duplicates.push({ original: nodes[i].id, duplicate: nodes[j].id });
        }
      }
    }

    if (duplicates.length === 0) {
      return null;
    }

    return {
      type: OptimizationType.REDUNDANCY,
      description: `Found ${duplicates.length} duplicate stages`,
      impact: ImpactLevel.LOW,
      before: duplicates,
      after: 'Merged',
      savings: {
        resources: duplicates.length,
      },
    };
  }

  private optimizeStageOrder(ast: WorkflowAST, workflow: WorkflowDSL): OptimizationReport | null {
    // Find stages that can be reordered for better performance
    const reorderable: { from: number; to: number; stage: StageId }[] = [];

    // Analyze dependencies to find stages that can be reordered
    const stages = Array.from(ast.nodes.keys());
    const dependencies = new Map<StageId, Set<StageId>>();

    // Build dependency graph
    ast.edges.forEach(edges => {
      edges.forEach(edge => {
        if (!dependencies.has(edge.to)) {
          dependencies.set(edge.to, new Set());
        }
        dependencies.get(edge.to)!.add(edge.from);
      });
    });

    // Find stages that can be moved earlier (have fewer dependencies)
    stages.forEach((stageId, currentIndex) => {
      const stageDeps = dependencies.get(stageId) || new Set();

      // Check if this stage can be moved to an earlier position
      for (let targetIndex = 0; targetIndex < currentIndex; targetIndex++) {
        const targetStage = stages[targetIndex];

        // Check if moving wouldn't violate dependencies
        if (!stageDeps.has(targetStage) && !dependencies.get(targetStage)?.has(stageId)) {
          reorderable.push({
            from: currentIndex,
            to: targetIndex,
            stage: stageId
          });
          break; // Only suggest one reordering per stage
        }
      }
    });

    if (reorderable.length === 0) {
      return null;
    }

    return {
      type: 'reordering' as any, // Cast to avoid enum mismatch
      stages: reorderable.map(r => r.stage),
      estimatedImprovement: reorderable.length * 5, // Estimate 5% improvement per reordering
      description: `Found ${reorderable.length} stages that can be reordered for better parallelization`,
      suggestions: reorderable,
      impact: ImpactLevel.MEDIUM,
      before: stages,
      after: reorderable
    };
  }

  private identifyCachingOpportunities(ast: WorkflowAST, workflow: WorkflowDSL): OptimizationReport | null {
    const cacheable: StageId[] = [];

    ast.nodes.forEach((node, id) => {
      if (node.type === StageType.TASK || node.type === StageType.TRANSFORM) {
        // Check if stage is deterministic and cacheable
        if (this.isStageCacheable(node.stage)) {
          cacheable.push(id);
        }
      }
    });

    if (cacheable.length === 0) {
      return null;
    }

    return {
      type: OptimizationType.CACHING,
      description: `Identified ${cacheable.length} stages suitable for caching`,
      impact: ImpactLevel.MEDIUM,
      before: 'No caching',
      after: cacheable,
      savings: {
        time: cacheable.length * 100, // Estimated ms saved per cached stage
      },
    };
  }

  // =====================
  // Executable Creation
  // =====================

  private async createExecutable(workflow: WorkflowDSL, ast: WorkflowAST): Promise<ExecutableWorkflow> {
    const stages = new Map<StageId, ExecutableStage>();
    const executionPlan = this.createExecutionPlan(ast, workflow);

    // Create executable stages
    for (const [id, node] of ast.nodes) {
      const executableStage = await this.createExecutableStage(node.stage, workflow);
      stages.set(id, executableStage);
    }

    const runtime: RuntimeConfig = {
      maxConcurrency: workflow.features?.parallelism?.maxWorkers || 10,
      checkpointInterval: workflow.features?.checkpointing ? 60000 : undefined,
      debugMode: workflow.features?.debugging || false,
      tracingEnabled: workflow.features?.tracing || false,
      metricsEnabled: workflow.features?.metrics || false,
      cachingEnabled: workflow.features?.caching?.enabled || false,
      environment: {},
    };

    return {
      id: workflow.metadata.id,
      version: workflow.metadata.version,
      stages,
      executionPlan,
      context: this.createInitialContext(workflow),
      runtime,
    };
  }

  private async createExecutableStage(stage: PipelineStage, workflow: WorkflowDSL): Promise<ExecutableStage> {
    return {
      id: stage.id,
      execute: async (context: WorkflowContext) => this.executeStage(stage, context),
      validate: (context: WorkflowContext) => this.validateStage(stage, context),
      estimateDuration: () => this.estimateStageDuration(stage),
      getDependencies: () => this.getStageDependencies(stage),
      canParallelize: () => this.isStageParallelizable(stage),
    };
  }

  private async executeStage(stage: PipelineStage, context: WorkflowContext): Promise<StageResult> {
    const startedAt = new Date();

    try {
      // Check condition if present
      const evalContext = {
        ...Object.fromEntries(context.variables),
        context: context,
        stage: stage
      };
      if (stage.condition && !this.evaluateExpression(stage.condition, evalContext)) {
        return {
          stageId: stage.id,
          status: ResultStatus.SKIPPED,
          startedAt,
          completedAt: new Date(),
          duration: Date.now() - startedAt.getTime(),
        };
      }

      let output: any;

      switch (stage.type) {
        case StageType.TASK:
          output = await this.executeTaskStage(stage as TaskStage, context);
          break;
        case StageType.SEQUENTIAL:
          output = await this.executeSequentialStage(stage as SequentialStage, context);
          break;
        case StageType.PARALLEL:
          output = await this.executeParallelStage(stage as ParallelStage, context);
          break;
        case StageType.CONDITIONAL:
          output = await this.executeConditionalStage(stage as ConditionalStage, context);
          break;
        case StageType.LOOP:
          output = await this.executeLoopStage(stage as LoopStage, context);
          break;
        case StageType.SUBWORKFLOW:
          output = await this.executeSubWorkflowStage(stage as SubWorkflowStage, context);
          break;
        case StageType.WAIT:
          output = await this.executeWaitStage(stage as WaitStage, context);
          break;
        case StageType.TRANSFORM:
          output = await this.executeTransformStage(stage as TransformStage, context);
          break;
        default:
          throw new Error(`Unknown stage type: ${(stage as any).type}`);
      }

      return {
        stageId: stage.id,
        status: ResultStatus.SUCCESS,
        output,
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
      };
    } catch (error) {
      const workflowError: WorkflowError = {
        code: 'STAGE_EXECUTION_ERROR',
        message: error instanceof Error ? error.message : String(error),
        stage: stage.id,
        timestamp: new Date(),
        stack: error instanceof Error ? error.stack : undefined,
        recoverable: false,
        retryable: true,
      };

      return {
        stageId: stage.id,
        status: ResultStatus.FAILURE,
        error: workflowError,
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
      };
    }
  }

  // Stage execution implementations
  private async executeTaskStage(stage: TaskStage, context: WorkflowContext): Promise<any> {
    // Integration with plugin manager
    if (!this.pluginManager) {
      throw new Error('Plugin manager not configured');
    }

    const evalContext = {
      ...Object.fromEntries(context.variables),
      context: context,
      stage: stage
    };

    const input = typeof stage.input === 'string'
      ? this.evaluateExpression(stage.input, evalContext)
      : stage.input;

    // First get the plugin for the agent
    const plugin = await this.pluginManager.getAgent(stage.agent, stage.complexity);
    if (!plugin) {
      throw new Error(`Agent ${stage.agent} not found`);
    }

    // Execute the plugin
    const result = await plugin.execute({
      complexity: stage.complexity,
      input,
      context: context.variables,
    });

    if (stage.output) {
      const transformedOutput = stage.output.transform
        ? this.evaluateExpression(stage.output.transform, {
            ...Object.fromEntries(context.variables),
            context: context,
            stage: stage,
            output: result
          })
        : result;

      context.variables.set(stage.output.variable, transformedOutput);
    }

    return result;
  }

  private async executeSequentialStage(stage: SequentialStage, context: WorkflowContext): Promise<any> {
    const results: any[] = [];

    for (const childStage of stage.stages) {
      const result = await this.executeStage(childStage, context);
      results.push(result.output);

      if (result.status === 'failure') {
        throw new Error(`Sequential stage ${childStage.id} failed`);
      }
    }

    return results;
  }

  private async executeParallelStage(stage: ParallelStage, context: WorkflowContext): Promise<any> {
    const maxConcurrency = stage.maxConcurrency || Infinity;
    const results: any[] = [];
    const executing = new Set<Promise<StageResult>>();

    for (const childStage of stage.stages) {
      if (executing.size >= maxConcurrency) {
        const completed = await Promise.race(executing);
        const firstPromise = executing.values().next().value;
        if (firstPromise) {
          executing.delete(firstPromise);
        }
        results.push(completed.output);
      }

      const promise = this.executeStage(childStage, context);
      executing.add(promise);
    }

    const remaining = await Promise.all(executing);
    results.push(...remaining.map((r) => r.output));

    if (stage.aggregateOutput) {
      return this.evaluateExpression(stage.aggregateOutput, {
        ...Object.fromEntries(context.variables),
        context: context,
        stage: stage,
        results: results
      });
    }

    return results;
  }

  private async executeConditionalStage(stage: ConditionalStage, context: WorkflowContext): Promise<any> {
    // Create evaluation context with workflow variables
    const evalContext = {
      ...Object.fromEntries(context.variables),
      context: context,
      stage: stage
    };
    const condition = this.evaluateExpression(stage.expression, evalContext);

    if (condition) {
      return this.executeStage(stage.thenStage, context);
    } else if (stage.elseStage) {
      return this.executeStage(stage.elseStage, context);
    }

    return null;
  }

  private async executeLoopStage(stage: LoopStage, context: WorkflowContext): Promise<any> {
    const results: any[] = [];
    const maxIterations = stage.maxIterations || 10000;
    let iterations = 0;

    // Create evaluation context with workflow variables
    const evalContext = {
      ...Object.fromEntries(context.variables),
      context: context,
      stage: stage
    };

    if (stage.iterator.type === 'foreach') {
      const collection = this.evaluateExpression(stage.iterator.collection || '[]', evalContext);

      for (const item of collection) {
        if (iterations >= maxIterations) break;

        if (stage.iterator.variable) {
          context.variables.set(stage.iterator.variable, item);
        }

        const result = await this.executeStage(stage.body, context);
        results.push(result.output);
        iterations++;
      }
    } else if (stage.iterator.type === 'for') {
      const start = stage.iterator.start || 0;
      const end = stage.iterator.end || 10;
      const step = stage.iterator.step || 1;

      for (let i = start; i < end; i += step) {
        if (iterations >= maxIterations) break;

        if (stage.iterator.variable) {
          context.variables.set(stage.iterator.variable, i);
        }

        const result = await this.executeStage(stage.body, context);
        results.push(result.output);
        iterations++;
      }
    } else if (stage.iterator.type === 'while') {
      while (this.evaluateExpression(stage.iterator.condition || 'false', context)) {
        if (iterations >= maxIterations) break;

        const result = await this.executeStage(stage.body, context);
        results.push(result.output);
        iterations++;
      }
    }

    return results;
  }

  private async executeSubWorkflowStage(stage: SubWorkflowStage, context: WorkflowContext): Promise<any> {
    // This would integrate with the workflow execution engine
    // For now, return a placeholder
    return {
      workflowId: stage.workflowId,
      version: stage.version,
      input: stage.input,
      status: 'completed',
    };
  }

  private async executeWaitStage(stage: WaitStage, context: WorkflowContext): Promise<any> {
    if (stage.duration) {
      await new Promise((resolve) => setTimeout(resolve, stage.duration));
    } else if (stage.until) {
      const untilDate = new Date(stage.until);
      const now = new Date();
      const delay = untilDate.getTime() - now.getTime();

      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } else if (stage.event) {
      // Wait for event - would integrate with event system
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return { waited: true };
  }

  private async executeTransformStage(stage: TransformStage, context: WorkflowContext): Promise<any> {
    const evalContext = {
      ...Object.fromEntries(context.variables),
      context: context,
      stage: stage
    };

    const input = typeof stage.input === 'string'
      ? this.evaluateExpression(stage.input, evalContext)
      : stage.input;

    const output = this.evaluateExpression(stage.transform, {
      ...Object.fromEntries(context.variables),
      context: context,
      stage: stage,
      input: input
    });

    context.variables.set(stage.output.variable, output);

    return output;
  }

  // =====================
  // Helper Methods
  // =====================

  private createExecutionPlan(ast: WorkflowAST, workflow: WorkflowDSL): ExecutionPlan {
    const phases: ExecutionPhase[] = [];
    const processed = new Set<StageId>();
    const criticalPath = this.findCriticalPath(ast);
    const parallelizableGroups = this.findParallelizableGroups(ast);

    let phaseIndex = 0;
    let totalDuration = 0;

    // Filter out child stages that are inside container stages (Sequential, Parallel, etc.)
    const topLevelNodes = this.getTopLevelNodes(ast);

    // Create execution phases based on dependencies
    while (processed.size < topLevelNodes.size) {
      const availableStages = this.findAvailableStages(ast, processed).filter(id => topLevelNodes.has(id));

      if (availableStages.length === 0) break;

      const parallel = availableStages.length > 1;
      const duration = parallel
        ? Math.max(...availableStages.map((id) => this.estimateStageDuration(ast.nodes.get(id)!.stage)))
        : availableStages.reduce((sum, id) => sum + this.estimateStageDuration(ast.nodes.get(id)!.stage), 0);

      phases.push({
        id: `phase-${phaseIndex++}`,
        stages: availableStages,
        parallel,
        estimatedDuration: duration,
        dependencies: phaseIndex > 0 ? [`phase-${phaseIndex - 2}`] : [],
      });

      totalDuration += duration;
      availableStages.forEach((id) => processed.add(id));
    }

    return {
      phases,
      totalEstimatedDuration: totalDuration,
      criticalPath,
      parallelizableStages: parallelizableGroups,
    };
  }

  private createInitialContext(workflow: WorkflowDSL): WorkflowContext {
    const variables = new Map<VariableName, any>();

    workflow.variables.forEach((varDef) => {
      variables.set(varDef.name, varDef.defaultValue);
    });

    if (workflow.context) {
      Object.entries(workflow.context).forEach(([key, value]) => {
        variables.set(key, value);
      });
    }

    return {
      workflowId: workflow.metadata.id,
      executionId: uuidv4(),
      variables,
      results: new Map(),
      metadata: {},
      checkpoints: [],
      status: ContextStatus.PENDING,
      errors: [],
    };
  }

  private validateStage(stage: PipelineStage, context: WorkflowContext): ValidationResult {
    const errors: ValidationResult['errors'] = [];
    const warnings: ValidationResult['warnings'] = [];

    // Check required variables
    if (stage.type === StageType.TASK) {
      const taskStage = stage as TaskStage;
      const requiredVars = this.extractVariableReferences(JSON.stringify(taskStage.input));

      requiredVars.forEach((varName) => {
        if (!context.variables.has(varName)) {
          errors.push({
            code: 'MISSING_VARIABLE',
            message: `Variable ${varName} is not defined`,
            path: `${stage.id}.input`,
            severity: ValidationSeverity.ERROR,
          });
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      info: [],
    };
  }

  private evaluateExpression(expression: string, context: any): any {
    // Simple expression evaluator
    // In production, use a proper sandboxed expression evaluator
    try {
      const func = new Function('context', `with(context) { return ${expression}; }`);
      return func(context);
    } catch (error) {
      console.error(`Failed to evaluate expression: ${expression}`, error);
      return undefined;
    }
  }

  // Analysis helpers
  private detectCircularDependencies(stages: PipelineStage[]): string[] {
    const visited = new Set<StageId>();
    const recursionStack = new Set<StageId>();
    const circular: string[] = [];

    const visit = (stageId: StageId): boolean => {
      visited.add(stageId);
      recursionStack.add(stageId);

      const stage = stages.find((s) => s.id === stageId);
      if (!stage) return false;

      const dependencies = this.getStageDependencies(stage);

      for (const dep of dependencies) {
        if (!visited.has(dep)) {
          if (visit(dep)) {
            circular.push(stageId);
            return true;
          }
        } else if (recursionStack.has(dep)) {
          circular.push(stageId);
          return true;
        }
      }

      recursionStack.delete(stageId);
      return false;
    };

    stages.forEach((stage) => {
      if (!visited.has(stage.id)) {
        visit(stage.id);
      }
    });

    return circular;
  }

  private findUndefinedReferences(workflow: WorkflowDSL): string[] {
    const allStageIds = new Set<StageId>();
    const references = new Set<StageId>();

    const collectStageIds = (stages: PipelineStage[]) => {
      stages.forEach((stage) => {
        allStageIds.add(stage.id);

        if (stage.type === StageType.SEQUENTIAL) {
          collectStageIds((stage as SequentialStage).stages);
        } else if (stage.type === StageType.PARALLEL) {
          collectStageIds((stage as ParallelStage).stages);
        }
      });
    };

    collectStageIds(workflow.pipeline);

    // Collect references
    workflow.pipeline.forEach((stage) => {
      if (stage.type === StageType.TASK) {
        const taskStage = stage as TaskStage;
        taskStage.dependencies?.forEach((dep) => references.add(dep));
      }
    });

    return Array.from(references).filter((ref) => !allStageIds.has(ref));
  }

  private findUnusedVariables(workflow: WorkflowDSL): string[] {
    const defined = new Set(workflow.variables.map((v) => v.name));
    const used = new Set<string>();

    const searchForVariables = (obj: any) => {
      const str = JSON.stringify(obj);
      const matches = str.match(/\$\{([^}]+)\}/g) || [];
      matches.forEach((match) => {
        const varName = match.slice(2, -1).split('.')[0];
        used.add(varName);
      });
    };

    workflow.pipeline.forEach((stage) => searchForVariables(stage));

    return Array.from(defined).filter((v) => !used.has(v));
  }

  private analyzePerformance(workflow: WorkflowDSL): Array<{
    message: string;
    path: string;
    suggestion: string;
  }> {
    const issues: Array<{ message: string; path: string; suggestion: string }> = [];

    workflow.pipeline.forEach((stage) => {
      if (stage.type === StageType.LOOP) {
        const loop = stage as LoopStage;
        if (!loop.maxIterations) {
          issues.push({
            message: `Loop stage ${stage.id} has no maximum iteration limit`,
            path: `pipeline.${stage.id}`,
            suggestion: 'Add maxIterations to prevent infinite loops',
          });
        }
      }

      if (stage.type === StageType.PARALLEL) {
        const parallel = stage as ParallelStage;
        if (!parallel.maxConcurrency && parallel.stages.length > 10) {
          issues.push({
            message: `Parallel stage ${stage.id} has ${parallel.stages.length} stages without concurrency limit`,
            path: `pipeline.${stage.id}`,
            suggestion: 'Add maxConcurrency to control resource usage',
          });
        }
      }
    });

    return issues;
  }

  private getStageChildren(stage: PipelineStage): string[] {
    switch (stage.type) {
      case StageType.SEQUENTIAL:
        return (stage as SequentialStage).stages.map((s) => s.id);
      case StageType.PARALLEL:
        return (stage as ParallelStage).stages.map((s) => s.id);
      case StageType.CONDITIONAL:
        const conditional = stage as ConditionalStage;
        return [conditional.thenStage.id, conditional.elseStage?.id].filter(Boolean) as string[];
      case StageType.LOOP:
        return [(stage as LoopStage).body.id];
      default:
        return [];
    }
  }

  private getStageDependencies(stage: PipelineStage): StageId[] {
    if (stage.type === StageType.TASK) {
      return (stage as TaskStage).dependencies || [];
    }
    return [];
  }

  private estimateStageDuration(stage: PipelineStage): number {
    // Rough estimates based on stage type
    switch (stage.type) {
      case StageType.TASK:
        return 1000; // 1 second default
      case StageType.WAIT:
        return (stage as WaitStage).duration || 1000;
      case StageType.TRANSFORM:
        return 10; // Very fast
      case StageType.SEQUENTIAL:
        return (stage as SequentialStage).stages.reduce(
          (sum, s) => sum + this.estimateStageDuration(s),
          0
        );
      case StageType.PARALLEL:
        return Math.max(...(stage as ParallelStage).stages.map((s) => this.estimateStageDuration(s)));
      default:
        return 100;
    }
  }

  private calculateStageComplexity(stage: PipelineStage): number {
    switch (stage.type) {
      case StageType.TASK:
        return (stage as TaskStage).complexity === 'complex' ? 3 :
               (stage as TaskStage).complexity === 'moderate' ? 2 : 1;
      case StageType.SEQUENTIAL:
        return (stage as SequentialStage).stages.reduce(
          (sum, s) => sum + this.calculateStageComplexity(s),
          0
        );
      case StageType.PARALLEL:
        return Math.max(...(stage as ParallelStage).stages.map((s) => this.calculateStageComplexity(s)));
      default:
        return 1;
    }
  }

  private isStageParallelizable(stage: PipelineStage): boolean {
    if (stage.type === StageType.TASK) {
      const task = stage as TaskStage;
      return !task.dependencies || task.dependencies.length === 0;
    }
    return false;
  }

  private areStagesIdentical(stage1: PipelineStage, stage2: PipelineStage): boolean {
    if (stage1.id === stage2.id) return false;
    if (stage1.type !== stage2.type) return false;

    // Simplified comparison - in practice would do deep equality check
    return JSON.stringify(stage1) === JSON.stringify(stage2);
  }

  private isStageCacheable(stage: PipelineStage): boolean {
    // Determine if stage output is deterministic and cacheable
    if (stage.type === StageType.TASK) {
      // Tasks with no external dependencies are cacheable
      return true;
    }
    if (stage.type === StageType.TRANSFORM) {
      // Pure transformations are cacheable
      return true;
    }
    return false;
  }

  private findParallelizableGroup(
    startId: StageId,
    ast: WorkflowAST,
    analyzed: Set<StageId>
  ): StageId[] {
    const group: StageId[] = [startId];
    analyzed.add(startId);

    // Find other stages at the same level with no dependencies
    ast.nodes.forEach((node, id) => {
      if (!analyzed.has(id) && node.metadata.parallelizable) {
        const startNode = ast.nodes.get(startId);
        if (startNode && node.depth === startNode.depth) {
          group.push(id);
          analyzed.add(id);
        }
      }
    });

    return group;
  }

  private estimateParallelizationSavings(groups: StageId[][], ast: WorkflowAST): number {
    let savings = 0;

    groups.forEach((group) => {
      const durations = group.map((id) => {
        const node = ast.nodes.get(id);
        return node ? this.estimateStageDuration(node.stage) : 0;
      });

      const sequential = durations.reduce((sum, d) => sum + d, 0);
      const parallel = Math.max(...durations);

      savings += sequential - parallel;
    });

    return savings;
  }

  private findCriticalPath(ast: WorkflowAST): StageId[] {
    // Simplified critical path finding
    // In practice, would use proper graph algorithms
    const path: StageId[] = [];
    const durations = new Map<StageId, number>();

    ast.nodes.forEach((node, id) => {
      durations.set(id, this.estimateStageDuration(node.stage));
    });

    // Find longest path with cycle detection
    const visited = new Set<StageId>();
    let current = ast.root.id;
    while (current && !visited.has(current)) {
      path.push(current);
      visited.add(current);
      const edges = ast.edges.get(current) || [];

      let maxDuration = 0;
      let next: StageId | undefined;

      edges.forEach((edge) => {
        if (!visited.has(edge.to)) {
          const duration = durations.get(edge.to) || 0;
          if (duration > maxDuration) {
            maxDuration = duration;
            next = edge.to;
          }
        }
      });

      current = next!;
    }

    return path;
  }

  private findParallelizableGroups(ast: WorkflowAST): StageId[][] {
    const groups: StageId[][] = [];
    const processed = new Set<StageId>();

    ast.nodes.forEach((node, id) => {
      if (!processed.has(id) && node.metadata.parallelizable) {
        const group = this.findParallelizableGroup(id, ast, processed);
        if (group.length > 1) {
          groups.push(group);
        }
      }
    });

    return groups;
  }

  private findAvailableStages(ast: WorkflowAST, processed: Set<StageId>): StageId[] {
    const available: StageId[] = [];

    ast.nodes.forEach((node, id) => {
      if (!processed.has(id)) {
        const dependencies = this.getStageDependencies(node.stage);
        const allDepsProcessed = dependencies.every((dep) => processed.has(dep));

        if (allDepsProcessed) {
          available.push(id);
        }
      }
    });

    return available;
  }

  private getTopLevelNodes(ast: WorkflowAST): Set<StageId> {
    const topLevel = new Set<StageId>();
    const childNodes = new Set<StageId>();

    // Find all nodes that are children of container stages
    for (const [id, node] of ast.nodes) {
      if (node.stage.type === StageType.SEQUENTIAL ||
          node.stage.type === StageType.PARALLEL ||
          node.stage.type === StageType.LOOP) {
        const containerStage = node.stage as any;
        if (containerStage.stages) {
          containerStage.stages.forEach((child: PipelineStage) => {
            childNodes.add(child.id);
          });
        }
      } else if (node.stage.type === StageType.CONDITIONAL) {
        const condStage = node.stage as ConditionalStage;
        if (condStage.thenStage) childNodes.add(condStage.thenStage.id);
        if (condStage.elseStage) childNodes.add(condStage.elseStage.id);
      }
    }

    // Add only nodes that are not children of other nodes
    for (const [id, node] of ast.nodes) {
      if (!childNodes.has(id)) {
        topLevel.add(id);
      }
    }

    return topLevel;
  }

  private extractVariableReferences(text: string): string[] {
    const pattern = /\$\{([^}]+)\}/g;
    const matches: string[] = [];
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const varName = match[1].split('.')[0];
      matches.push(varName);
    }

    return [...new Set(matches)];
  }
}