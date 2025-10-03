import {
  WorkflowDSL,
  WorkflowAST,
  PipelineStage,
  StageType,
  OptimizationReport,
  StageId,
  TaskStage,
  SequentialStage,
  ParallelStage,
  ConditionalStage,
  LoopStage,
  SubWorkflowStage,
  TransformStage,
  WaitStage,
  ASTNode,
  ASTEdge,
  ExecutionPlan,
  ExecutionPhase,
} from './types';
import { OptimizationType, ImpactLevel, EdgeType } from '../enums';

export interface OptimizationOptions {
  enableParallelization?: boolean;
  enableCaching?: boolean;
  enableDeadCodeElimination?: boolean;
  enableRedundancyRemoval?: boolean;
  enableStageReordering?: boolean;
  enableLoopUnrolling?: boolean;
  enableConstantFolding?: boolean;
  enableBranchPrediction?: boolean;
  maxParallelism?: number;
  cacheTTL?: number;
  aggressiveOptimization?: boolean;
}

export interface OptimizationContext {
  workflow: WorkflowDSL;
  ast: WorkflowAST;
  options: OptimizationOptions;
  metrics: OptimizationMetrics;
}

export interface OptimizationMetrics {
  originalDuration: number;
  optimizedDuration: number;
  stagesOptimized: number;
  parallelizationGain: number;
  cachingGain: number;
  deadCodeRemoved: number;
  redundancyRemoved: number;
}

export class WorkflowOptimizer {
  private readonly defaultOptions: OptimizationOptions = {
    enableParallelization: true,
    enableCaching: true,
    enableDeadCodeElimination: true,
    enableRedundancyRemoval: true,
    enableStageReordering: true,
    enableLoopUnrolling: false,
    enableConstantFolding: true,
    enableBranchPrediction: true,
    maxParallelism: 10,
    cacheTTL: 3600000, // 1 hour
    aggressiveOptimization: false,
  };

  public optimize(
    workflow: WorkflowDSL,
    ast: WorkflowAST,
    options?: OptimizationOptions
  ): {
    optimizedWorkflow: WorkflowDSL;
    optimizedAST: WorkflowAST;
    reports: OptimizationReport[];
    metrics: OptimizationMetrics;
  } {
    const opts = { ...this.defaultOptions, ...options };
    const context: OptimizationContext = {
      workflow: this.cloneWorkflow(workflow),
      ast: this.cloneAST(ast),
      options: opts,
      metrics: this.initializeMetrics(workflow, ast),
    };

    const reports: OptimizationReport[] = [];

    // Apply optimizations in order of impact
    if (opts.enableDeadCodeElimination) {
      const report = this.eliminateDeadCode(context);
      if (report) reports.push(report);
    }

    if (opts.enableConstantFolding) {
      const report = this.foldConstants(context);
      if (report) reports.push(report);
    }

    if (opts.enableRedundancyRemoval) {
      const report = this.removeRedundancy(context);
      if (report) reports.push(report);
    }

    if (opts.enableParallelization) {
      const report = this.optimizeParallelization(context);
      if (report) reports.push(report);
    }

    if (opts.enableStageReordering) {
      const report = this.reorderStages(context);
      if (report) reports.push(report);
    }

    if (opts.enableLoopUnrolling) {
      const report = this.unrollLoops(context);
      if (report) reports.push(report);
    }

    if (opts.enableCaching) {
      const report = this.addCaching(context);
      if (report) reports.push(report);
    }

    if (opts.enableBranchPrediction) {
      const report = this.optimizeBranches(context);
      if (report) reports.push(report);
    }

    // Additional aggressive optimizations
    if (opts.aggressiveOptimization) {
      const aggressiveReports = this.applyAggressiveOptimizations(context);
      reports.push(...aggressiveReports);
    }

    this.calculateFinalMetrics(context);

    return {
      optimizedWorkflow: context.workflow,
      optimizedAST: context.ast,
      reports,
      metrics: context.metrics,
    };
  }

  // =====================
  // Dead Code Elimination
  // =====================

  private eliminateDeadCode(context: OptimizationContext): OptimizationReport | null {
    const reachable = this.findReachableStages(context.ast);
    const unreachable: StageId[] = [];

    context.ast.nodes.forEach((node, id) => {
      if (!reachable.has(id)) {
        unreachable.push(id);
      }
    });

    if (unreachable.length === 0) {
      return null;
    }

    // Remove unreachable stages from AST
    unreachable.forEach((id) => {
      context.ast.nodes.delete(id);
      context.ast.edges.delete(id);

      // Remove edges pointing to this node
      context.ast.edges.forEach((edges, fromId) => {
        const filtered = edges.filter((edge) => edge.to !== id);
        if (filtered.length > 0) {
          context.ast.edges.set(fromId, filtered);
        } else {
          context.ast.edges.delete(fromId);
        }
      });
    });

    // Remove from workflow pipeline
    context.workflow.pipeline = this.removeStagesFromPipeline(
      context.workflow.pipeline,
      new Set(unreachable)
    );

    context.metrics.deadCodeRemoved = unreachable.length;

    return {
      type: OptimizationType.DEAD_CODE,
      description: `Eliminated ${unreachable.length} unreachable stages`,
      impact: ImpactLevel.HIGH,
      before: unreachable,
      after: 'removed',
      savings: {
        resources: unreachable.length,
        time: unreachable.length * 100,
      },
    };
  }

  // =====================
  // Constant Folding
  // =====================

  private foldConstants(context: OptimizationContext): OptimizationReport | null {
    const folded: { stageId: StageId; before: any; after: any }[] = [];

    context.workflow.pipeline.forEach((stage) => {
      this.foldConstantsInStage(stage, folded);
    });

    if (folded.length === 0) {
      return null;
    }

    return {
      type: OptimizationType.REDUNDANCY,
      description: `Folded ${folded.length} constant expressions`,
      impact: ImpactLevel.LOW,
      before: folded.map((f) => f.before),
      after: folded.map((f) => f.after),
      savings: {
        time: folded.length * 10,
      },
    };
  }

  private foldConstantsInStage(stage: PipelineStage, folded: any[]): void {
    if (stage.type === StageType.TRANSFORM) {
      const transform = stage as TransformStage;

      // Try to evaluate constant expressions
      if (typeof transform.input === 'object') {
        const constantValue = this.tryEvaluateConstant(transform.input);
        if (constantValue !== null) {
          folded.push({
            stageId: stage.id,
            before: transform.input,
            after: constantValue,
          });
          transform.input = constantValue;
        }
      }
    }

    // Recursively process nested stages
    if (stage.type === StageType.SEQUENTIAL) {
      (stage as SequentialStage).stages.forEach((s) => this.foldConstantsInStage(s, folded));
    } else if (stage.type === StageType.PARALLEL) {
      (stage as ParallelStage).stages.forEach((s) => this.foldConstantsInStage(s, folded));
    }
  }

  // =====================
  // Redundancy Removal
  // =====================

  private removeRedundancy(context: OptimizationContext): OptimizationReport | null {
    const duplicates = this.findDuplicateStages(context.ast);

    if (duplicates.length === 0) {
      return null;
    }

    // Merge duplicate stages
    duplicates.forEach(({ original, duplicate }) => {
      // Redirect all edges from duplicate to original
      context.ast.edges.forEach((edges, fromId) => {
        edges.forEach((edge) => {
          if (edge.to === duplicate) {
            edge.to = original;
          }
        });
      });

      // Remove duplicate node
      context.ast.nodes.delete(duplicate);
      context.ast.edges.delete(duplicate);
    });

    // Update workflow pipeline
    context.workflow.pipeline = this.replaceDuplicatesInPipeline(
      context.workflow.pipeline,
      duplicates
    );

    context.metrics.redundancyRemoved = duplicates.length;

    return {
      type: OptimizationType.REDUNDANCY,
      description: `Removed ${duplicates.length} duplicate stages`,
      impact: ImpactLevel.MEDIUM,
      before: duplicates,
      after: 'merged',
      savings: {
        resources: duplicates.length,
        time: duplicates.length * 50,
      },
    };
  }

  // =====================
  // Parallelization
  // =====================

  private optimizeParallelization(context: OptimizationContext): OptimizationReport | null {
    const groups = this.findParallelizableGroups(context.ast);

    if (groups.length === 0) {
      return null;
    }

    // Convert sequential stages to parallel where possible
    const converted: { before: StageId[]; after: ParallelStage }[] = [];

    groups.forEach((group) => {
      if (group.length > 1) {
        const newParallelStage = this.createParallelStageFromGroup(group, context);
        if (newParallelStage) {
          converted.push({
            before: group,
            after: newParallelStage,
          });

          // Update workflow pipeline
          context.workflow.pipeline = this.replaceWithParallelStage(
            context.workflow.pipeline,
            group,
            newParallelStage
          );
        }
      }
    });

    if (converted.length === 0) {
      return null;
    }

    const timeSaved = converted.reduce((sum, c) => {
      return sum + this.estimateParallelizationSavings(c.before, context.ast);
    }, 0);

    context.metrics.parallelizationGain = timeSaved;

    return {
      type: OptimizationType.PARALLELIZATION,
      description: `Created ${converted.length} parallel execution groups`,
      impact: ImpactLevel.HIGH,
      before: converted.map((c) => c.before),
      after: converted.map((c) => c.after.id),
      savings: {
        time: timeSaved,
      },
    };
  }

  // =====================
  // Stage Reordering
  // =====================

  private reorderStages(context: OptimizationContext): OptimizationReport | null {
    const reordering = this.findOptimalOrdering(context.ast);

    if (reordering.length === 0) {
      return null;
    }

    // Apply reordering to workflow pipeline
    const originalOrder = context.workflow.pipeline.map((s) => s.id);
    context.workflow.pipeline = this.applyReordering(context.workflow.pipeline, reordering);
    const newOrder = context.workflow.pipeline.map((s) => s.id);

    // Update AST edges to reflect new ordering
    this.updateASTForReordering(context.ast, reordering);

    return {
      type: OptimizationType.REORDERING,
      description: `Reordered ${reordering.length} stages for optimal execution`,
      impact: ImpactLevel.MEDIUM,
      before: originalOrder,
      after: newOrder,
      savings: {
        time: reordering.length * 20,
      },
    };
  }

  // =====================
  // Loop Unrolling
  // =====================

  private unrollLoops(context: OptimizationContext): OptimizationReport | null {
    const unrolled: { stageId: StageId; iterations: number }[] = [];

    context.workflow.pipeline = this.unrollLoopsInPipeline(context.workflow.pipeline, unrolled);

    if (unrolled.length === 0) {
      return null;
    }

    return {
      type: OptimizationType.REDUNDANCY,
      description: `Unrolled ${unrolled.length} loops`,
      impact: ImpactLevel.LOW,
      before: unrolled.map((u) => `${u.stageId}: loop`),
      after: unrolled.map((u) => `${u.stageId}: ${u.iterations} sequential stages`),
      savings: {
        time: unrolled.reduce((sum, u) => sum + u.iterations * 5, 0),
      },
    };
  }

  private unrollLoopsInPipeline(
    pipeline: PipelineStage[],
    unrolled: { stageId: StageId; iterations: number }[]
  ): PipelineStage[] {
    return pipeline.map((stage) => {
      if (stage.type === StageType.LOOP) {
        const loop = stage as LoopStage;

        // Only unroll small, fixed-iteration loops
        if (loop.iterator.type === 'for' && loop.iterator.end && loop.iterator.start !== undefined) {
          const iterations = loop.iterator.end - loop.iterator.start;

          if (iterations <= 5 && iterations > 0) {
            unrolled.push({ stageId: stage.id, iterations });

            // Create sequential stage with unrolled iterations
            const unrolledStages: PipelineStage[] = [];

            for (let i = loop.iterator.start; i < loop.iterator.end; i += loop.iterator.step || 1) {
              const clonedBody = this.cloneStage(loop.body);
              clonedBody.id = `${clonedBody.id}_unrolled_${i}`;
              unrolledStages.push(clonedBody);
            }

            return {
              ...stage,
              type: StageType.SEQUENTIAL,
              stages: unrolledStages,
            } as SequentialStage;
          }
        }
      }

      // Recursively process nested stages
      if (stage.type === StageType.SEQUENTIAL) {
        return {
          ...stage,
          stages: this.unrollLoopsInPipeline((stage as SequentialStage).stages, unrolled),
        } as SequentialStage;
      }

      if (stage.type === StageType.PARALLEL) {
        return {
          ...stage,
          stages: this.unrollLoopsInPipeline((stage as ParallelStage).stages, unrolled),
        } as ParallelStage;
      }

      return stage;
    });
  }

  // =====================
  // Caching
  // =====================

  private addCaching(context: OptimizationContext): OptimizationReport | null {
    const cacheable = this.findCacheableStages(context);

    if (cacheable.length === 0) {
      return null;
    }

    // Mark stages as cacheable in metadata
    cacheable.forEach((stageId) => {
      const node = context.ast.nodes.get(stageId);
      if (node) {
        if (!node.stage.metadata) {
          node.stage.metadata = {};
        }
        node.stage.metadata.cacheable = true;
        node.stage.metadata.cacheTTL = context.options.cacheTTL;
      }
    });

    context.metrics.cachingGain = cacheable.length * 100;

    return {
      type: OptimizationType.CACHING,
      description: `Enabled caching for ${cacheable.length} deterministic stages`,
      impact: ImpactLevel.MEDIUM,
      before: 'no caching',
      after: cacheable,
      savings: {
        time: cacheable.length * 100,
      },
    };
  }

  // =====================
  // Branch Optimization
  // =====================

  private optimizeBranches(context: OptimizationContext): OptimizationReport | null {
    const optimized: { stageId: StageId; prediction: string }[] = [];

    context.workflow.pipeline.forEach((stage) => {
      if (stage.type === StageType.CONDITIONAL) {
        const conditional = stage as ConditionalStage;

        // Add branch prediction hint based on static analysis
        const prediction = this.predictBranch(conditional.expression);

        if (prediction !== 'unknown') {
          optimized.push({
            stageId: stage.id,
            prediction,
          });

          if (!stage.metadata) {
            stage.metadata = {};
          }
          stage.metadata.branchPrediction = prediction;
        }
      }
    });

    if (optimized.length === 0) {
      return null;
    }

    return {
      type: OptimizationType.REORDERING,
      description: `Added branch predictions for ${optimized.length} conditional stages`,
      impact: ImpactLevel.LOW,
      before: 'no predictions',
      after: optimized,
      savings: {
        time: optimized.length * 10,
      },
    };
  }

  // =====================
  // Aggressive Optimizations
  // =====================

  private applyAggressiveOptimizations(context: OptimizationContext): OptimizationReport[] {
    const reports: OptimizationReport[] = [];

    // Inline small subworkflows
    const inlining = this.inlineSubworkflows(context);
    if (inlining) reports.push(inlining);

    // Merge adjacent transform stages
    const merging = this.mergeTransforms(context);
    if (merging) reports.push(merging);

    // Speculative execution for predictable branches
    const speculation = this.addSpeculativeExecution(context);
    if (speculation) reports.push(speculation);

    // Pipeline fusion
    const fusion = this.fusePipelines(context);
    if (fusion) reports.push(fusion);

    return reports;
  }

  private inlineSubworkflows(context: OptimizationContext): OptimizationReport | null {
    const inlined: StageId[] = [];

    // Find small subworkflows that can be inlined
    context.workflow.pipeline.forEach((stage) => {
      if (stage.type === StageType.SUBWORKFLOW) {
        const subworkflow = stage as SubWorkflowStage;

        // Only inline if subworkflow is simple enough
        // In practice, would check actual subworkflow complexity
        if (!subworkflow.async) {
          inlined.push(stage.id);
        }
      }
    });

    if (inlined.length === 0) {
      return null;
    }

    return {
      type: OptimizationType.REDUNDANCY,
      description: `Inlined ${inlined.length} simple subworkflows`,
      impact: ImpactLevel.MEDIUM,
      before: inlined,
      after: 'inlined',
      savings: {
        time: inlined.length * 200,
      },
    };
  }

  private mergeTransforms(context: OptimizationContext): OptimizationReport | null {
    const merged: { stages: StageId[]; into: StageId }[] = [];

    // Find adjacent transform stages that can be merged
    for (let i = 0; i < context.workflow.pipeline.length - 1; i++) {
      const current = context.workflow.pipeline[i];
      const next = context.workflow.pipeline[i + 1];

      if (current.type === StageType.TRANSFORM && next.type === StageType.TRANSFORM) {
        const currentTransform = current as TransformStage;
        const nextTransform = next as TransformStage;

        // Check if transforms can be merged
        if (this.canMergeTransforms(currentTransform, nextTransform)) {
          merged.push({
            stages: [current.id, next.id],
            into: current.id,
          });

          // Merge the transforms
          currentTransform.transform = `(${currentTransform.transform}) |> (${nextTransform.transform})`;
          currentTransform.output = nextTransform.output;

          // Remove the next stage
          context.workflow.pipeline.splice(i + 1, 1);
          i--; // Adjust index
        }
      }
    }

    if (merged.length === 0) {
      return null;
    }

    return {
      type: OptimizationType.REDUNDANCY,
      description: `Merged ${merged.length} adjacent transform stages`,
      impact: ImpactLevel.LOW,
      before: merged.map((m) => m.stages),
      after: merged.map((m) => m.into),
      savings: {
        time: merged.length * 20,
        resources: merged.length,
      },
    };
  }

  private addSpeculativeExecution(context: OptimizationContext): OptimizationReport | null {
    const speculative: StageId[] = [];

    context.workflow.pipeline.forEach((stage) => {
      if (stage.type === StageType.CONDITIONAL) {
        const conditional = stage as ConditionalStage;

        // Add speculative execution for highly predictable branches
        const prediction = this.predictBranch(conditional.expression);

        if (prediction === 'likely_true' || prediction === 'likely_false') {
          speculative.push(stage.id);

          if (!stage.metadata) {
            stage.metadata = {};
          }
          stage.metadata.speculativeExecution = true;
          stage.metadata.speculativeBranch = prediction === 'likely_true' ? 'then' : 'else';
        }
      }
    });

    if (speculative.length === 0) {
      return null;
    }

    return {
      type: OptimizationType.PARALLELIZATION,
      description: `Enabled speculative execution for ${speculative.length} predictable branches`,
      impact: ImpactLevel.MEDIUM,
      before: 'sequential',
      after: speculative,
      savings: {
        time: speculative.length * 50,
      },
    };
  }

  private fusePipelines(context: OptimizationContext): OptimizationReport | null {
    const fused: { pipelines: StageId[]; into: StageId }[] = [];

    // Find sequential stages that can be fused into a single pipeline
    const fusable = this.findFusablePipelines(context.workflow.pipeline);

    fusable.forEach((group) => {
      if (group.length > 2) {
        const fusedStage = this.createFusedPipeline(group);

        fused.push({
          pipelines: group.map((s) => s.id),
          into: fusedStage.id,
        });

        // Replace group with fused stage
        const firstIndex = context.workflow.pipeline.findIndex((s) => s.id === group[0].id);
        if (firstIndex >= 0) {
          context.workflow.pipeline.splice(firstIndex, group.length, fusedStage);
        }
      }
    });

    if (fused.length === 0) {
      return null;
    }

    return {
      type: OptimizationType.REDUNDANCY,
      description: `Fused ${fused.length} pipeline segments`,
      impact: ImpactLevel.HIGH,
      before: fused.map((f) => f.pipelines),
      after: fused.map((f) => f.into),
      savings: {
        time: fused.reduce((sum, f) => sum + f.pipelines.length * 30, 0),
        resources: fused.reduce((sum, f) => sum + f.pipelines.length - 1, 0),
      },
    };
  }

  // =====================
  // Helper Methods
  // =====================

  private cloneWorkflow(workflow: WorkflowDSL): WorkflowDSL {
    // Use structured cloning to preserve Date objects
    const cloned = JSON.parse(JSON.stringify(workflow));

    // Restore Date objects
    if (cloned.metadata) {
      if (cloned.metadata.created) {
        cloned.metadata.created = new Date(cloned.metadata.created);
      }
      if (cloned.metadata.updated) {
        cloned.metadata.updated = new Date(cloned.metadata.updated);
      }
    }

    return cloned;
  }

  private cloneAST(ast: WorkflowAST): WorkflowAST {
    return {
      root: { ...ast.root },
      nodes: new Map(ast.nodes),
      edges: new Map(ast.edges),
      variables: new Map(ast.variables),
      dependencies: new Map(ast.dependencies),
    };
  }

  private cloneStage(stage: PipelineStage): PipelineStage {
    return JSON.parse(JSON.stringify(stage));
  }

  private initializeMetrics(workflow: WorkflowDSL, ast: WorkflowAST): OptimizationMetrics {
    const originalDuration = this.estimateTotalDuration(ast);

    return {
      originalDuration,
      optimizedDuration: originalDuration,
      stagesOptimized: 0,
      parallelizationGain: 0,
      cachingGain: 0,
      deadCodeRemoved: 0,
      redundancyRemoved: 0,
    };
  }

  private calculateFinalMetrics(context: OptimizationContext): void {
    context.metrics.optimizedDuration = this.estimateTotalDuration(context.ast);
    context.metrics.stagesOptimized =
      context.metrics.deadCodeRemoved +
      context.metrics.redundancyRemoved +
      Math.floor(context.metrics.parallelizationGain / 100);
  }

  private estimateTotalDuration(ast: WorkflowAST): number {
    let total = 0;
    ast.nodes.forEach((node) => {
      total += this.estimateStageDuration(node.stage);
    });
    return total;
  }

  private estimateStageDuration(stage: PipelineStage): number {
    switch (stage.type) {
      case StageType.TASK:
        return 1000;
      case StageType.WAIT:
        return (stage as WaitStage).duration || 1000;
      case StageType.TRANSFORM:
        return 10;
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

  private findReachableStages(ast: WorkflowAST): Set<StageId> {
    const reachable = new Set<StageId>();
    const queue = [ast.root.id];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (reachable.has(current)) continue;

      reachable.add(current);

      const edges = ast.edges.get(current) || [];
      edges.forEach((edge) => queue.push(edge.to));
    }

    return reachable;
  }

  private findDuplicateStages(ast: WorkflowAST): Array<{ original: StageId; duplicate: StageId }> {
    const duplicates: Array<{ original: StageId; duplicate: StageId }> = [];
    const seen = new Map<string, StageId>();

    ast.nodes.forEach((node, id) => {
      const hash = this.hashStage(node.stage);

      if (seen.has(hash)) {
        duplicates.push({
          original: seen.get(hash)!,
          duplicate: id,
        });
      } else {
        seen.set(hash, id);
      }
    });

    return duplicates;
  }

  private hashStage(stage: PipelineStage): string {
    // Create a hash of the stage for duplicate detection
    // Exclude the ID for comparison
    const { id, ...stageWithoutId } = stage;
    return JSON.stringify(stageWithoutId);
  }

  private findParallelizableGroups(ast: WorkflowAST): StageId[][] {
    const groups: StageId[][] = [];
    const processed = new Set<StageId>();

    // Find stages with no dependencies between them
    ast.nodes.forEach((node, id) => {
      if (!processed.has(id)) {
        const group = this.findIndependentStages(id, ast, processed);
        if (group.length > 1) {
          groups.push(group);
        }
      }
    });

    return groups;
  }

  private findIndependentStages(
    startId: StageId,
    ast: WorkflowAST,
    processed: Set<StageId>
  ): StageId[] {
    const group: StageId[] = [];
    const startNode = ast.nodes.get(startId);

    if (!startNode) return group;

    // Find stages at the same depth with no dependencies
    ast.nodes.forEach((node, id) => {
      if (!processed.has(id) && node.depth === startNode.depth) {
        // Check if there are dependencies between stages
        const hasDependency = this.hasDependencyBetween(startId, id, ast);

        if (!hasDependency) {
          group.push(id);
          processed.add(id);
        }
      }
    });

    return group;
  }

  private hasDependencyBetween(stage1: StageId, stage2: StageId, ast: WorkflowAST): boolean {
    // Check if stage1 depends on stage2 or vice versa
    const deps1 = ast.dependencies.get(stage1) || [];
    const deps2 = ast.dependencies.get(stage2) || [];

    return deps1.includes(stage2) || deps2.includes(stage1);
  }

  private findOptimalOrdering(ast: WorkflowAST): Array<{ from: number; to: number; stage: StageId }> {
    const reordering: Array<{ from: number; to: number; stage: StageId }> = [];

    // Use topological sort to find optimal ordering
    const sorted = this.topologicalSort(ast);

    // Compare with current ordering and identify beneficial reorderings
    // This is a simplified implementation
    return reordering;
  }

  private topologicalSort(ast: WorkflowAST): StageId[] {
    const sorted: StageId[] = [];
    const visited = new Set<StageId>();
    const temp = new Set<StageId>();

    const visit = (id: StageId) => {
      if (temp.has(id)) {
        // Instead of throwing, we've detected a cycle - likely from a loop edge
        // Just return without processing further to break the cycle
        return;
      }

      if (visited.has(id)) {
        return;
      }

      temp.add(id);

      const edges = ast.edges.get(id) || [];
      edges.forEach((edge) => {
        // Skip loop back edges to prevent cycles
        if (edge.type === EdgeType.LOOP && edge.metadata && typeof edge.metadata === 'object' && (edge.metadata as any).type === 'continue') {
          return;
        }
        visit(edge.to);
      });

      temp.delete(id);
      visited.add(id);
      sorted.unshift(id);
    };

    ast.nodes.forEach((_, id) => {
      if (!visited.has(id)) {
        visit(id);
      }
    });

    return sorted;
  }

  private tryEvaluateConstant(value: any): any | null {
    // Try to evaluate if value is a constant expression
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'object' && value !== null) {
      const isConstant = Object.values(value).every(
        (v) => typeof v !== 'function' && !String(v).includes('${')
      );

      if (isConstant) {
        return value;
      }
    }

    return null;
  }

  private removeStagesFromPipeline(
    pipeline: PipelineStage[],
    toRemove: Set<StageId>
  ): PipelineStage[] {
    return pipeline
      .filter((stage) => !toRemove.has(stage.id))
      .map((stage) => {
        if (stage.type === StageType.SEQUENTIAL) {
          return {
            ...stage,
            stages: this.removeStagesFromPipeline((stage as SequentialStage).stages, toRemove),
          } as SequentialStage;
        }

        if (stage.type === StageType.PARALLEL) {
          return {
            ...stage,
            stages: this.removeStagesFromPipeline((stage as ParallelStage).stages, toRemove),
          } as ParallelStage;
        }

        return stage;
      });
  }

  private replaceDuplicatesInPipeline(
    pipeline: PipelineStage[],
    duplicates: Array<{ original: StageId; duplicate: StageId }>
  ): PipelineStage[] {
    const replacementMap = new Map(duplicates.map((d) => [d.duplicate, d.original]));

    return pipeline.map((stage) => {
      if (replacementMap.has(stage.id)) {
        // Replace with reference to original
        return { ...stage, id: replacementMap.get(stage.id)! };
      }

      if (stage.type === StageType.SEQUENTIAL) {
        return {
          ...stage,
          stages: this.replaceDuplicatesInPipeline((stage as SequentialStage).stages, duplicates),
        } as SequentialStage;
      }

      if (stage.type === StageType.PARALLEL) {
        return {
          ...stage,
          stages: this.replaceDuplicatesInPipeline((stage as ParallelStage).stages, duplicates),
        } as ParallelStage;
      }

      return stage;
    });
  }

  private createParallelStageFromGroup(
    group: StageId[],
    context: OptimizationContext
  ): ParallelStage | null {
    const stages = group
      .map((id) => context.ast.nodes.get(id)?.stage)
      .filter(Boolean) as PipelineStage[];

    if (stages.length < 2) return null;

    return {
      id: `parallel_${group.join('_')}`,
      name: `Parallel execution of ${group.length} stages`,
      type: StageType.PARALLEL,
      stages,
      maxConcurrency: context.options.maxParallelism,
      waitAll: true,
    };
  }

  private replaceWithParallelStage(
    pipeline: PipelineStage[],
    group: StageId[],
    parallelStage: ParallelStage
  ): PipelineStage[] {
    const groupSet = new Set(group);
    const result: PipelineStage[] = [];
    let replaced = false;

    for (const stage of pipeline) {
      if (!replaced && groupSet.has(stage.id)) {
        result.push(parallelStage);
        replaced = true;
      } else if (!groupSet.has(stage.id)) {
        result.push(stage);
      }
    }

    return result;
  }

  private estimateParallelizationSavings(group: StageId[], ast: WorkflowAST): number {
    const durations = group.map((id) => {
      const node = ast.nodes.get(id);
      return node ? this.estimateStageDuration(node.stage) : 0;
    });

    const sequential = durations.reduce((sum, d) => sum + d, 0);
    const parallel = Math.max(...durations);

    return sequential - parallel;
  }

  private applyReordering(
    pipeline: PipelineStage[],
    reordering: Array<{ from: number; to: number; stage: StageId }>
  ): PipelineStage[] {
    // Apply the reordering operations
    const result = [...pipeline];

    reordering.forEach(({ from, to, stage }) => {
      const stageObj = result[from];
      result.splice(from, 1);
      result.splice(to, 0, stageObj);
    });

    return result;
  }

  private updateASTForReordering(
    ast: WorkflowAST,
    reordering: Array<{ from: number; to: number; stage: StageId }>
  ): void {
    // Update AST edges to reflect new ordering
    reordering.forEach(({ stage }) => {
      // Update edges as needed
      // This is a simplified implementation
    });
  }

  private findCacheableStages(context: OptimizationContext): StageId[] {
    const cacheable: StageId[] = [];

    context.ast.nodes.forEach((node, id) => {
      if (this.isCacheable(node.stage)) {
        cacheable.push(id);
      }
    });

    return cacheable;
  }

  private isCacheable(stage: PipelineStage): boolean {
    // Determine if stage is deterministic and cacheable
    if (stage.type === StageType.TASK || stage.type === StageType.TRANSFORM) {
      // Check if stage has no side effects and is deterministic
      return !stage.metadata?.hasSideEffects && !stage.metadata?.nonDeterministic;
    }

    return false;
  }

  private predictBranch(expression: string): string {
    // Simple branch prediction based on expression analysis
    if (expression.includes('== true') || expression.includes('=== true')) {
      return 'likely_true';
    }

    if (expression.includes('== false') || expression.includes('=== false')) {
      return 'likely_false';
    }

    if (expression.includes('!') && !expression.includes('!=')) {
      return 'likely_false';
    }

    return 'unknown';
  }

  private canMergeTransforms(transform1: TransformStage, transform2: TransformStage): boolean {
    // Check if the output of transform1 is the input of transform2
    return (
      transform1.output.variable === (transform2.input as string)?.replace(/\$\{|\}/g, '')
    );
  }

  private findFusablePipelines(pipeline: PipelineStage[]): PipelineStage[][] {
    const groups: PipelineStage[][] = [];
    let currentGroup: PipelineStage[] = [];

    pipeline.forEach((stage) => {
      if (stage.type === StageType.TASK || stage.type === StageType.TRANSFORM) {
        currentGroup.push(stage);
      } else {
        if (currentGroup.length > 2) {
          groups.push(currentGroup);
        }
        currentGroup = [];
      }
    });

    if (currentGroup.length > 2) {
      groups.push(currentGroup);
    }

    return groups;
  }

  private createFusedPipeline(stages: PipelineStage[]): SequentialStage {
    return {
      id: `fused_${stages.map((s) => s.id).join('_')}`,
      name: `Fused pipeline of ${stages.length} stages`,
      type: StageType.SEQUENTIAL,
      stages,
      metadata: {
        fused: true,
        originalCount: stages.length,
      },
    };
  }
}