import { compare, satisfies, valid, coerce } from 'semver';
import {
  WorkflowDSL,
  WorkflowVersion,
  WorkflowMigration,
  MigrationChange,
  ValidationResult,
  PipelineStage,
  StageType,
  ErrorStrategy,
  RetryStrategy,
} from './types';
import { MigrationType, VariableType } from '../enums';
import { validateWorkflowDSL } from './schemas';

export interface VersionMetadata {
  version: WorkflowVersion;
  releaseDate: Date;
  author: string;
  description: string;
  breaking: boolean;
  deprecated?: boolean;
  endOfLife?: Date;
  migrationRequired?: boolean;
  changes: VersionChange[];
}

export interface VersionChange {
  type: 'feature' | 'fix' | 'breaking' | 'deprecation';
  description: string;
  component?: string;
  migration?: string;
}

export interface MigrationStrategy {
  automatic: boolean;
  reversible: boolean;
  dataLoss: boolean;
  requiresApproval: boolean;
  estimatedDuration: number;
}

export interface VersionRegistry {
  current: WorkflowVersion;
  supported: WorkflowVersion[];
  deprecated: WorkflowVersion[];
  migrations: Map<string, WorkflowMigration>;
  metadata: Map<WorkflowVersion, VersionMetadata>;
}

export class WorkflowVersionManager {
  private registry: VersionRegistry;
  private migrationStrategies: Map<string, MigrationStrategy>;

  constructor() {
    this.registry = {
      current: '2.0.0',
      supported: ['2.0.0', '1.5.0', '1.4.0', '1.3.0'],
      deprecated: ['1.2.0', '1.1.0', '1.0.0'],
      migrations: new Map(),
      metadata: new Map(),
    };

    this.migrationStrategies = new Map();
    this.initializeBuiltInMigrations();
  }

  // =====================
  // Version Management
  // =====================

  public async registerVersion(
    version: WorkflowVersion,
    metadata: Omit<VersionMetadata, 'version'>
  ): Promise<void> {
    const validVersion = valid(version);
    if (!validVersion) {
      throw new Error(`Invalid version format: ${version}`);
    }

    const versionMetadata: VersionMetadata = {
      version: validVersion,
      ...metadata,
    };

    this.registry.metadata.set(validVersion, versionMetadata);

    if (!metadata.deprecated) {
      this.registry.supported.push(validVersion);
    } else {
      this.registry.deprecated.push(validVersion);
    }

    // Sort versions
    this.registry.supported.sort((a, b) => compare(b, a));
    this.registry.deprecated.sort((a, b) => compare(b, a));
  }

  public isVersionSupported(version: WorkflowVersion): boolean {
    return this.registry.supported.includes(version) || version === this.registry.current;
  }

  public isVersionDeprecated(version: WorkflowVersion): boolean {
    return this.registry.deprecated.includes(version);
  }

  public getLatestVersion(): WorkflowVersion {
    return this.registry.current;
  }

  public getVersionMetadata(version: WorkflowVersion): VersionMetadata | undefined {
    return this.registry.metadata.get(version);
  }

  // =====================
  // Migration Management
  // =====================

  public async registerMigration(migration: WorkflowMigration): Promise<void> {
    const key = `${migration.fromVersion}->${migration.toVersion}`;

    // Validate version formats
    if (!valid(migration.fromVersion) || !valid(migration.toVersion)) {
      throw new Error('Invalid version format in migration');
    }

    // Ensure versions are in correct order
    if (compare(migration.fromVersion, migration.toVersion) >= 0) {
      throw new Error('Migration must be from older to newer version');
    }

    this.registry.migrations.set(key, migration);

    // Register migration strategy
    const strategy = this.analyzeMigrationStrategy(migration);
    this.migrationStrategies.set(key, strategy);
  }

  public async migrateWorkflow(
    workflow: WorkflowDSL,
    targetVersion?: WorkflowVersion
  ): Promise<{
    workflow: WorkflowDSL;
    migrations: WorkflowMigration[];
    report: MigrationReport;
  }> {
    const currentVersion = workflow.metadata.version;
    const target = targetVersion || this.registry.current;

    // Check if migration is needed
    if (currentVersion === target) {
      return {
        workflow,
        migrations: [],
        report: {
          success: true,
          fromVersion: currentVersion,
          toVersion: target,
          changes: [],
          warnings: [],
          errors: [],
        },
      };
    }

    // Find migration path
    const migrationPath = this.findMigrationPath(currentVersion, target);

    if (migrationPath.length === 0) {
      throw new Error(`No migration path found from ${currentVersion} to ${target}`);
    }

    // Apply migrations sequentially
    let migratedWorkflow = { ...workflow };
    const appliedMigrations: WorkflowMigration[] = [];
    const report: MigrationReport = {
      success: true,
      fromVersion: currentVersion,
      toVersion: target,
      changes: [],
      warnings: [],
      errors: [],
    };

    for (const migration of migrationPath) {
      try {
        const result = await this.applyMigration(migratedWorkflow, migration);
        migratedWorkflow = result.workflow;
        appliedMigrations.push(migration);

        report.changes.push(...result.changes);
        report.warnings.push(...result.warnings);
      } catch (error) {
        report.success = false;
        report.errors.push({
          migration: `${migration.fromVersion}->${migration.toVersion}`,
          error: error instanceof Error ? error.message : String(error),
        });

        // Attempt rollback if possible
        if (migration.rollback && appliedMigrations.length > 0) {
          try {
            migratedWorkflow = await this.rollbackMigrations(workflow, appliedMigrations);
            report.rolledBack = true;
          } catch (rollbackError) {
            report.rollbackError = rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError);
          }
        }

        throw new Error(`Migration failed: ${error}`);
      }
    }

    // Validate migrated workflow
    const validationResult = validateWorkflowDSL(migratedWorkflow);
    if (!validationResult.valid) {
      report.success = false;
      const errorDetails = validationResult.errors
        .map((e) => `${e.path}: ${e.message}`)
        .join(', ');
      report.errors.push({
        migration: 'validation',
        error: `Migrated workflow validation failed: ${errorDetails}`,
      });

      throw new Error(`Migrated workflow validation failed: ${errorDetails}`);
    }

    return {
      workflow: migratedWorkflow,
      migrations: appliedMigrations,
      report,
    };
  }

  private async applyMigration(
    workflow: WorkflowDSL,
    migration: WorkflowMigration
  ): Promise<{
    workflow: WorkflowDSL;
    changes: string[];
    warnings: string[];
  }> {
    // Create a deep copy while preserving dates
    const migratedWorkflow = this.deepCloneWithDates(workflow);
    const changes: string[] = [];
    const warnings: string[] = [];

    // Validate that workflow matches expected version
    if (!migration.validate(migratedWorkflow)) {
      throw new Error(
        `Workflow does not meet requirements for migration from ${migration.fromVersion}`
      );
    }

    // Apply migration
    const result = migration.migrate(migratedWorkflow);

    // Track changes
    migration.changes.forEach((change) => {
      const changeDesc = `${change.type} at ${change.path}: ${change.description}`;
      changes.push(changeDesc);

      if (change.breaking) {
        warnings.push(`Breaking change: ${changeDesc}`);
      }
    });

    // Update version
    result.metadata.version = migration.toVersion;
    result.metadata.updated = new Date();

    return {
      workflow: result,
      changes,
      warnings,
    };
  }

  private async rollbackMigrations(
    originalWorkflow: WorkflowDSL,
    migrations: WorkflowMigration[]
  ): Promise<WorkflowDSL> {
    let workflow = { ...originalWorkflow };

    // Rollback in reverse order
    for (const migration of migrations.reverse()) {
      if (migration.rollback) {
        workflow = migration.rollback(workflow);
      } else {
        throw new Error(
          `Cannot rollback migration from ${migration.fromVersion} to ${migration.toVersion}`
        );
      }
    }

    return workflow;
  }

  // =====================
  // Migration Path Finding
  // =====================

  private findMigrationPath(
    fromVersion: WorkflowVersion,
    toVersion: WorkflowVersion
  ): WorkflowMigration[] {
    const path: WorkflowMigration[] = [];
    let currentVersion = fromVersion;

    // Use BFS to find shortest migration path
    const queue: Array<{ version: WorkflowVersion; path: WorkflowMigration[] }> = [
      { version: fromVersion, path: [] },
    ];
    const visited = new Set<WorkflowVersion>([fromVersion]);

    while (queue.length > 0) {
      const { version, path: currentPath } = queue.shift()!;

      if (version === toVersion) {
        return currentPath;
      }

      // Find all migrations from current version
      this.registry.migrations.forEach((migration, key) => {
        if (migration.fromVersion === version && !visited.has(migration.toVersion)) {
          visited.add(migration.toVersion);
          queue.push({
            version: migration.toVersion,
            path: [...currentPath, migration],
          });
        }
      });
    }

    return [];
  }

  // =====================
  // Built-in Migrations
  // =====================

  private initializeBuiltInMigrations(): void {
    // Migration from 1.0.0 to 1.1.0
    this.registerMigration({
      fromVersion: '1.0.0',
      toVersion: '1.1.0',
      changes: [
        {
          type: MigrationType.ADD,
          path: 'features.caching',
          description: 'Added caching feature configuration',
          breaking: false,
          automated: true,
          migration: (value) => ({ enabled: false, ttl: 3600000 }),
        },
      ],
      migrate: (workflow) => this.migrate_1_0_0_to_1_1_0(workflow),
      validate: (workflow) => workflow.metadata.version === '1.0.0',
    });

    // Migration from 1.1.0 to 1.2.0
    this.registerMigration({
      fromVersion: '1.1.0',
      toVersion: '1.2.0',
      changes: [
        {
          type: MigrationType.RENAME,
          path: 'errorHandling.strategy',
          description: 'Renamed error strategies for clarity',
          breaking: true,
          automated: true,
          migration: (value) => this.mapOldErrorStrategy(value),
        },
      ],
      migrate: (workflow) => this.migrate_1_1_0_to_1_2_0(workflow),
      validate: (workflow) => workflow.metadata.version === '1.1.0',
    });

    // Migration from 1.2.0 to 1.3.0
    this.registerMigration({
      fromVersion: '1.2.0',
      toVersion: '1.3.0',
      changes: [
        {
          type: MigrationType.RESTRUCTURE,
          path: 'pipeline',
          description: 'Restructured pipeline stages for better parallelization',
          breaking: false,
          automated: true,
        },
      ],
      migrate: (workflow) => this.migrate_1_2_0_to_1_3_0(workflow),
      validate: (workflow) => workflow.metadata.version === '1.2.0',
    });

    // Migration from 1.3.0 to 1.4.0
    this.registerMigration({
      fromVersion: '1.3.0',
      toVersion: '1.4.0',
      changes: [
        {
          type: MigrationType.ADD,
          path: 'hooks',
          description: 'Added workflow lifecycle hooks',
          breaking: false,
          automated: true,
        },
      ],
      migrate: (workflow) => this.migrate_1_3_0_to_1_4_0(workflow),
      validate: (workflow) => workflow.metadata.version === '1.3.0',
    });

    // Migration from 1.4.0 to 1.5.0
    this.registerMigration({
      fromVersion: '1.4.0',
      toVersion: '1.5.0',
      changes: [
        {
          type: MigrationType.MODIFY,
          path: 'variables',
          description: 'Enhanced variable definitions with validation',
          breaking: false,
          automated: true,
        },
      ],
      migrate: (workflow) => this.migrate_1_4_0_to_1_5_0(workflow),
      validate: (workflow) => workflow.metadata.version === '1.4.0',
    });

    // Migration from 1.5.0 to 2.0.0 (major version)
    this.registerMigration({
      fromVersion: '1.5.0',
      toVersion: '2.0.0',
      changes: [
        {
          type: MigrationType.RESTRUCTURE,
          path: 'entire workflow',
          description: 'Complete restructure for DSL v2',
          breaking: true,
          automated: false,
        },
      ],
      migrate: (workflow) => this.migrate_1_5_0_to_2_0_0(workflow),
      validate: (workflow) => workflow.metadata.version === '1.5.0',
      rollback: (workflow) => this.rollback_2_0_0_to_1_5_0(workflow),
    });
  }

  // =====================
  // Specific Migrations
  // =====================

  private migrate_1_0_0_to_1_1_0(workflow: WorkflowDSL): WorkflowDSL {
    // Add caching feature if not present
    if (!workflow.features) {
      workflow.features = {};
    }

    if (!workflow.features.caching) {
      workflow.features.caching = {
        enabled: false,
        ttl: 3600000,
      };
    }

    return workflow;
  }

  private migrate_1_1_0_to_1_2_0(workflow: WorkflowDSL): WorkflowDSL {
    // Rename error strategies
    const strategyMap: Record<string, ErrorStrategy> = {
      'fail': ErrorStrategy.FAIL_FAST,
      'continue': ErrorStrategy.CONTINUE,
      'retry': ErrorStrategy.RETRY,
      'ignore': ErrorStrategy.IGNORE,
    };

    if (workflow.errorHandling?.strategy) {
      const oldStrategy = workflow.errorHandling.strategy as string;
      workflow.errorHandling.strategy = strategyMap[oldStrategy] || ErrorStrategy.FAIL_FAST;
    }

    // Update stages recursively
    workflow.pipeline = this.updateErrorStrategiesInPipeline(workflow.pipeline, strategyMap);

    return workflow;
  }

  private migrate_1_2_0_to_1_3_0(workflow: WorkflowDSL): WorkflowDSL {
    // Analyze and restructure pipeline for better parallelization
    workflow.pipeline = this.optimizePipelineStructure(workflow.pipeline);
    return workflow;
  }

  private migrate_1_3_0_to_1_4_0(workflow: WorkflowDSL): WorkflowDSL {
    // Add default hooks if not present
    if (!workflow.hooks) {
      workflow.hooks = {
        beforeStart: undefined,
        afterComplete: undefined,
        onError: undefined,
        onCancel: undefined,
        onTimeout: undefined,
      };
    }

    return workflow;
  }

  private migrate_1_4_0_to_1_5_0(workflow: WorkflowDSL): WorkflowDSL {
    // Enhance variable definitions
    workflow.variables = workflow.variables.map((variable) => {
      if (!variable.type) {
        // Infer type from default value
        const inferredType = this.inferVariableType(variable.defaultValue);
        return {
          ...variable,
          type: inferredType,
        };
      }
      return variable;
    });

    return workflow;
  }

  private migrate_1_5_0_to_2_0_0(workflow: WorkflowDSL): WorkflowDSL {
    // Major version migration - complete restructure

    // Convert old stage format to new DSL format
    workflow.pipeline = this.convertToV2Pipeline(workflow.pipeline);

    // Update metadata
    workflow.metadata = {
      ...workflow.metadata,
      version: '2.0.0',
      updated: new Date(),
    };

    // Add new required fields
    if (!workflow.errorHandling) {
      workflow.errorHandling = {
        strategy: ErrorStrategy.FAIL_FAST,
      };
    }

    if (!workflow.timeouts) {
      workflow.timeouts = {
        global: 300000, // 5 minutes default
      };
    }

    return workflow;
  }

  private rollback_2_0_0_to_1_5_0(workflow: WorkflowDSL): WorkflowDSL {
    // Rollback from v2 to v1.5.0

    // Convert pipeline back to v1 format
    workflow.pipeline = this.convertToV1Pipeline(workflow.pipeline);

    // Revert metadata
    workflow.metadata.version = '1.5.0';

    // Remove v2-specific fields
    delete (workflow as any).features?.parallelism;

    return workflow;
  }

  // =====================
  // Helper Methods
  // =====================

  private analyzeMigrationStrategy(migration: WorkflowMigration): MigrationStrategy {
    const hasBreakingChanges = migration.changes.some((c) => c.breaking);
    const hasDataLoss = migration.changes.some((c) => c.type === 'remove');
    const isAutomatic = migration.changes.every((c) => c.automated);

    return {
      automatic: isAutomatic,
      reversible: !!migration.rollback,
      dataLoss: hasDataLoss,
      requiresApproval: hasBreakingChanges || hasDataLoss,
      estimatedDuration: migration.changes.length * 100, // Rough estimate
    };
  }

  private mapOldErrorStrategy(oldStrategy: string): ErrorStrategy {
    const strategyMap: Record<string, ErrorStrategy> = {
      'fail': ErrorStrategy.FAIL_FAST,
      'continue': ErrorStrategy.CONTINUE,
      'retry': ErrorStrategy.RETRY,
      'ignore': ErrorStrategy.IGNORE,
      'compensate': ErrorStrategy.COMPENSATE,
      'fallback': ErrorStrategy.FALLBACK,
    };

    return strategyMap[oldStrategy] || ErrorStrategy.FAIL_FAST;
  }

  private updateErrorStrategiesInPipeline(
    pipeline: PipelineStage[],
    strategyMap: Record<string, ErrorStrategy>
  ): PipelineStage[] {
    return pipeline.map((stage) => {
      if (stage.errorHandler?.strategy) {
        const oldStrategy = stage.errorHandler.strategy as string;
        stage.errorHandler.strategy = strategyMap[oldStrategy] || ErrorStrategy.FAIL_FAST;
      }

      // Recursively update nested stages
      if ('stages' in stage) {
        (stage as any).stages = this.updateErrorStrategiesInPipeline(
          (stage as any).stages,
          strategyMap
        );
      }

      return stage;
    });
  }

  private optimizePipelineStructure(pipeline: PipelineStage[]): PipelineStage[] {
    // Analyze pipeline and identify parallelizable stages
    const optimized: PipelineStage[] = [];
    let i = 0;

    while (i < pipeline.length) {
      const current = pipeline[i];
      const parallelizable: PipelineStage[] = [current];

      // Look ahead for parallelizable stages
      let j = i + 1;
      while (j < pipeline.length && this.canParallelize(pipeline[j], parallelizable)) {
        parallelizable.push(pipeline[j]);
        j++;
      }

      if (parallelizable.length > 1) {
        // Create parallel stage
        optimized.push({
          id: `parallel_${parallelizable.map((s) => s.id).join('_')}`,
          name: `Parallel execution`,
          type: StageType.PARALLEL,
          stages: parallelizable,
        } as any);
        i = j;
      } else {
        optimized.push(current);
        i++;
      }
    }

    return optimized;
  }

  private canParallelize(stage: PipelineStage, withStages: PipelineStage[]): boolean {
    // Simple check - in practice would do dependency analysis
    if (stage.type === StageType.TASK) {
      const task = stage as any;
      if (task.dependencies) {
        return !task.dependencies.some((dep: string) =>
          withStages.some((s) => s.id === dep)
        );
      }
      return true;
    }
    return false;
  }

  private inferVariableType(value: any): VariableType {
    if (value === null || value === undefined) {
      return VariableType.ANY;
    }
    if (typeof value === 'string') return VariableType.STRING;
    if (typeof value === 'number') return VariableType.NUMBER;
    if (typeof value === 'boolean') return VariableType.BOOLEAN;
    if (Array.isArray(value)) return VariableType.ARRAY;
    if (typeof value === 'object') return VariableType.OBJECT;
    return VariableType.ANY;
  }

  private convertToV2Pipeline(pipeline: PipelineStage[]): PipelineStage[] {
    // Convert old pipeline format to v2 DSL format
    return pipeline.map((stage: any) => {
      // Add required v2 fields if missing
      if (!stage.type) {
        // Infer type from stage structure
        if ('stages' in stage) {
          stage.type = StageType.SEQUENTIAL;
        } else if ('agent' in stage) {
          stage.type = StageType.TASK;
        } else {
          stage.type = StageType.TASK;
        }
      }

      // Recursively convert nested stages
      if ('stages' in stage) {
        (stage as any).stages = this.convertToV2Pipeline((stage as any).stages);
      }

      return stage;
    });
  }

  private convertToV1Pipeline(pipeline: PipelineStage[]): PipelineStage[] {
    // Convert v2 pipeline back to v1 format
    return pipeline.map((stage) => {
      const v1Stage = { ...stage };

      // Remove v2-specific fields
      delete (v1Stage as any).type;

      // Recursively convert nested stages
      if ('stages' in v1Stage) {
        (v1Stage as any).stages = this.convertToV1Pipeline((v1Stage as any).stages);
      }

      return v1Stage;
    });
  }

  // =====================
  // Version Comparison
  // =====================

  public compareVersions(version1: WorkflowVersion, version2: WorkflowVersion): number {
    return compare(version1, version2);
  }

  public satisfiesVersion(version: WorkflowVersion, range: string): boolean {
    return satisfies(version, range);
  }

  public coerceVersion(version: string): WorkflowVersion | null {
    const coerced = coerce(version);
    return coerced ? coerced.version : null;
  }

  // =====================
  // Compatibility Checking
  // =====================

  public checkCompatibility(
    workflow: WorkflowDSL,
    targetEnvironment?: {
      minVersion?: WorkflowVersion;
      maxVersion?: WorkflowVersion;
      features?: string[];
    }
  ): CompatibilityReport {
    const report: CompatibilityReport = {
      compatible: true,
      issues: [],
      warnings: [],
      suggestions: [],
    };

    const workflowVersion = workflow.metadata.version;

    // Check version compatibility
    if (targetEnvironment?.minVersion) {
      if (compare(workflowVersion, targetEnvironment.minVersion) < 0) {
        report.compatible = false;
        report.issues.push({
          type: 'version',
          message: `Workflow version ${workflowVersion} is below minimum required version ${targetEnvironment.minVersion}`,
          severity: 'error',
        });
      }
    }

    if (targetEnvironment?.maxVersion) {
      if (compare(workflowVersion, targetEnvironment.maxVersion) > 0) {
        report.compatible = false;
        report.issues.push({
          type: 'version',
          message: `Workflow version ${workflowVersion} is above maximum supported version ${targetEnvironment.maxVersion}`,
          severity: 'error',
        });
      }
    }

    // Check feature compatibility
    if (targetEnvironment?.features) {
      const usedFeatures = this.extractUsedFeatures(workflow);
      const unsupportedFeatures = usedFeatures.filter(
        (f) => !targetEnvironment.features!.includes(f)
      );

      if (unsupportedFeatures.length > 0) {
        report.compatible = false;
        report.issues.push({
          type: 'feature',
          message: `Workflow uses unsupported features: ${unsupportedFeatures.join(', ')}`,
          severity: 'error',
        });
      }
    }

    // Check for deprecated features
    if (this.isVersionDeprecated(workflowVersion)) {
      report.warnings.push({
        type: 'deprecation',
        message: `Workflow version ${workflowVersion} is deprecated`,
        severity: 'warning',
      });

      report.suggestions.push({
        type: 'migration',
        message: `Consider migrating to version ${this.registry.current}`,
      });
    }

    return report;
  }

  private extractUsedFeatures(workflow: WorkflowDSL): string[] {
    const features: string[] = [];

    // Check for various features
    if (workflow.features?.caching?.enabled) {
      features.push('caching');
    }

    if (workflow.features?.parallelism?.enabled) {
      features.push('parallelism');
    }

    if (workflow.features?.checkpointing) {
      features.push('checkpointing');
    }

    if (workflow.hooks && Object.values(workflow.hooks).some(Boolean)) {
      features.push('hooks');
    }

    if (workflow.triggers && workflow.triggers.length > 0) {
      features.push('triggers');
    }

    // Check for advanced stage types
    const hasAdvancedStages = this.checkForAdvancedStages(workflow.pipeline);
    if (hasAdvancedStages.loop) features.push('loops');
    if (hasAdvancedStages.conditional) features.push('conditionals');
    if (hasAdvancedStages.parallel) features.push('parallel');
    if (hasAdvancedStages.subworkflow) features.push('subworkflows');

    return features;
  }

  private checkForAdvancedStages(pipeline: PipelineStage[]): {
    loop: boolean;
    conditional: boolean;
    parallel: boolean;
    subworkflow: boolean;
  } {
    const result = {
      loop: false,
      conditional: false,
      parallel: false,
      subworkflow: false,
    };

    const check = (stages: PipelineStage[]) => {
      stages.forEach((stage) => {
        if (stage.type === StageType.LOOP) result.loop = true;
        if (stage.type === StageType.CONDITIONAL) result.conditional = true;
        if (stage.type === StageType.PARALLEL) result.parallel = true;
        if (stage.type === StageType.SUBWORKFLOW) result.subworkflow = true;

        // Check nested stages
        if ('stages' in stage) {
          check((stage as any).stages);
        }
        if ('body' in stage) {
          check([(stage as any).body]);
        }
        if ('thenStage' in stage) {
          check([(stage as any).thenStage]);
          if ((stage as any).elseStage) {
            check([(stage as any).elseStage]);
          }
        }
      });
    };

    check(pipeline);
    return result;
  }

  private deepCloneWithDates<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime()) as unknown as T;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepCloneWithDates(item)) as unknown as T;
    }

    const cloned = {} as T;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = this.deepCloneWithDates(obj[key]);
      }
    }
    return cloned;
  }
}

// =====================
// Types
// =====================

export interface MigrationReport {
  success: boolean;
  fromVersion: WorkflowVersion;
  toVersion: WorkflowVersion;
  changes: string[];
  warnings: string[];
  errors: Array<{
    migration: string;
    error: string;
  }>;
  rolledBack?: boolean;
  rollbackError?: string;
}

export interface CompatibilityReport {
  compatible: boolean;
  issues: CompatibilityIssue[];
  warnings: CompatibilityIssue[];
  suggestions: Array<{
    type: string;
    message: string;
  }>;
}

export interface CompatibilityIssue {
  type: 'version' | 'feature' | 'deprecation' | 'breaking';
  message: string;
  severity: 'error' | 'warning';
}