import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  WorkflowVersionManager,
  WorkflowDSL,
  StageType,
  ErrorStrategy,
  ComplexityLevel,
  TaskStage,
} from '../../core/workflow';

describe('WorkflowVersionManager', () => {
  let versionManager: WorkflowVersionManager;

  beforeEach(() => {
    versionManager = new WorkflowVersionManager();
  });

  describe('version management', () => {
    it('should register new versions', async () => {
      await versionManager.registerVersion('3.0.0', {
        releaseDate: new Date(),
        author: 'test',
        description: 'Test version 3.0.0',
        breaking: true,
        changes: [
          {
            type: 'feature',
            description: 'Added new feature X',
          },
        ],
      });

      const metadata = versionManager.getVersionMetadata('3.0.0');
      expect(metadata).toBeDefined();
      expect(metadata?.version).toBe('3.0.0');
      expect(metadata?.breaking).toBe(true);
    });

    it('should track supported versions', () => {
      expect(versionManager.isVersionSupported('2.0.0')).toBe(true);
      expect(versionManager.isVersionSupported('1.5.0')).toBe(true);
      expect(versionManager.isVersionSupported('0.1.0')).toBe(false);
    });

    it('should track deprecated versions', () => {
      expect(versionManager.isVersionDeprecated('1.0.0')).toBe(true);
      expect(versionManager.isVersionDeprecated('1.1.0')).toBe(true);
      expect(versionManager.isVersionDeprecated('2.0.0')).toBe(false);
    });

    it('should get latest version', () => {
      const latest = versionManager.getLatestVersion();
      expect(latest).toBe('2.0.0');
    });

    it('should compare versions', () => {
      expect(versionManager.compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
      expect(versionManager.compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0);
      expect(versionManager.compareVersions('1.0.0', '1.0.0')).toBe(0);
    });

    it('should check version satisfaction', () => {
      expect(versionManager.satisfiesVersion('1.5.0', '>=1.0.0')).toBe(true);
      expect(versionManager.satisfiesVersion('1.5.0', '^1.0.0')).toBe(true);
      expect(versionManager.satisfiesVersion('2.0.0', '^1.0.0')).toBe(false);
    });

    it('should coerce version strings', () => {
      expect(versionManager.coerceVersion('1')).toBe('1.0.0');
      expect(versionManager.coerceVersion('1.2')).toBe('1.2.0');
      expect(versionManager.coerceVersion('v1.2.3')).toBe('1.2.3');
      expect(versionManager.coerceVersion('invalid')).toBeNull();
    });
  });

  describe('workflow migration', () => {
    it('should migrate workflow to latest version', async () => {
      const oldWorkflow: WorkflowDSL = {
        metadata: {
          id: 'old-workflow',
          name: 'Old Workflow',
          version: '1.0.0',
          author: 'test',
          description: 'Test old workflow',
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
            agent: 'test-agent',
            complexity: ComplexityLevel.SIMPLE,
            input: {},
          } as TaskStage,
        ],
        errorHandling: {
          strategy: 'fail' as any, // Old strategy name
        },
        timeouts: {
          global: 60000,
        },
      };

      const result = await versionManager.migrateWorkflow(oldWorkflow);

      expect(result.workflow.metadata.version).toBe('2.0.0');
      expect(result.migrations.length).toBeGreaterThan(0);
      expect(result.report.success).toBe(true);
      expect(result.report.fromVersion).toBe('1.0.0');
      expect(result.report.toVersion).toBe('2.0.0');
    });

    it('should skip migration if already at target version', async () => {
      const currentWorkflow: WorkflowDSL = {
        metadata: {
          id: 'current-workflow',
          name: 'Current Workflow',
          version: '2.0.0',
          author: 'test',
          description: 'Test current workflow',
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

      const result = await versionManager.migrateWorkflow(currentWorkflow, '2.0.0');

      expect(result.workflow.metadata.version).toBe('2.0.0');
      expect(result.migrations.length).toBe(0);
      expect(result.report.success).toBe(true);
    });

    it('should apply multiple migrations in sequence', async () => {
      const veryOldWorkflow: WorkflowDSL = {
        metadata: {
          id: 'very-old-workflow',
          name: 'Very Old Workflow',
          version: '1.1.0',
          author: 'test',
          description: 'Test very old workflow',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [],
        pipeline: [],
        errorHandling: {
          strategy: 'continue' as any, // Old strategy
        },
        timeouts: {
          global: 60000,
        },
      };

      const result = await versionManager.migrateWorkflow(veryOldWorkflow, '2.0.0');

      expect(result.workflow.metadata.version).toBe('2.0.0');
      expect(result.migrations.length).toBeGreaterThanOrEqual(4); // 1.1->1.2->1.3->1.4->1.5->2.0
      expect(result.report.changes.length).toBeGreaterThan(0);
    });

    it('should handle migration with breaking changes', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'breaking-change',
          name: 'Breaking Change Workflow',
          version: '1.1.0',
          author: 'test',
          description: 'Test breaking change',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [],
        pipeline: [],
        errorHandling: {
          strategy: 'retry' as any, // Will be migrated
        },
        timeouts: {
          global: 60000,
        },
      };

      const result = await versionManager.migrateWorkflow(workflow, '1.2.0');

      expect(result.workflow.metadata.version).toBe('1.2.0');
      expect(result.workflow.errorHandling.strategy).toBe(ErrorStrategy.RETRY);
      expect(result.report.warnings.some((w) => w.includes('Breaking change'))).toBe(true);
    });

    it('should error if no migration path exists', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'no-path',
          name: 'No Path Workflow',
          version: '0.1.0', // Too old
          author: 'test',
          description: 'Test no migration path',
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

      await expect(versionManager.migrateWorkflow(workflow)).rejects.toThrow(
        'No migration path found'
      );
    });

    it('should add default values during migration', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'default-values',
          name: 'Default Values',
          version: '1.0.0',
          author: 'test',
          description: 'Test default values',
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
        // No features field - will be added
      };

      const result = await versionManager.migrateWorkflow(workflow, '1.1.0');

      expect(result.workflow.features).toBeDefined();
      expect(result.workflow.features?.caching).toBeDefined();
      expect(result.workflow.features?.caching?.enabled).toBe(false);
      expect(result.workflow.features?.caching?.ttl).toBe(3600000);
    });

    it('should add hooks during migration', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'add-hooks',
          name: 'Add Hooks',
          version: '1.3.0',
          author: 'test',
          description: 'Test hook addition',
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
        features: {
          caching: {
            enabled: true,
            ttl: 3600000,
          },
        },
      };

      const result = await versionManager.migrateWorkflow(workflow, '1.4.0');

      expect(result.workflow.hooks).toBeDefined();
      expect(result.workflow.hooks?.beforeStart).toBeUndefined();
      expect(result.workflow.hooks?.onError).toBeUndefined();
    });

    it('should infer variable types during migration', async () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'infer-types',
          name: 'Infer Types',
          version: '1.4.0',
          author: 'test',
          description: 'Test type inference',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [
          {
            name: 'stringVar',
            defaultValue: 'text',
          } as any, // Missing type
          {
            name: 'numberVar',
            defaultValue: 42,
          } as any,
          {
            name: 'booleanVar',
            defaultValue: true,
          } as any,
        ],
        pipeline: [],
        errorHandling: {
          strategy: ErrorStrategy.FAIL_FAST,
        },
        timeouts: {
          global: 60000,
        },
        features: {
          caching: {
            enabled: false,
            ttl: 3600000,
          },
        },
        hooks: {},
      };

      const result = await versionManager.migrateWorkflow(workflow, '1.5.0');

      expect(result.workflow.variables[0].type).toBe('string');
      expect(result.workflow.variables[1].type).toBe('number');
      expect(result.workflow.variables[2].type).toBe('boolean');
    });
  });

  describe('compatibility checking', () => {
    it('should check version compatibility', () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'compatibility',
          name: 'Compatibility Test',
          version: '1.5.0',
          author: 'test',
          description: 'Test compatibility',
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

      const report = versionManager.checkCompatibility(workflow, {
        minVersion: '1.0.0',
        maxVersion: '2.0.0',
      });

      expect(report.compatible).toBe(true);
      expect(report.issues.length).toBe(0);
    });

    it('should detect version incompatibility', () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'incompatible',
          name: 'Incompatible Test',
          version: '0.5.0',
          author: 'test',
          description: 'Test incompatibility',
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

      const report = versionManager.checkCompatibility(workflow, {
        minVersion: '1.0.0',
      });

      expect(report.compatible).toBe(false);
      expect(report.issues.length).toBeGreaterThan(0);
      expect(report.issues[0].type).toBe('version');
      expect(report.issues[0].severity).toBe('error');
    });

    it('should detect feature incompatibility', () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'feature-incompatible',
          name: 'Feature Incompatible',
          version: '2.0.0',
          author: 'test',
          description: 'Test feature incompatibility',
          tags: [],
          created: new Date(),
          updated: new Date(),
        },
        variables: [],
        pipeline: [
          {
            id: 'loop1',
            name: 'Loop',
            type: StageType.LOOP,
            iterator: {
              type: 'for',
              start: 0,
              end: 10,
            },
            body: {
              id: 'task1',
              name: 'Task',
              type: StageType.TASK,
              agent: 'test',
              complexity: ComplexityLevel.SIMPLE,
              input: {},
            } as TaskStage,
          } as any,
        ],
        errorHandling: {
          strategy: ErrorStrategy.FAIL_FAST,
        },
        timeouts: {
          global: 60000,
        },
        features: {
          caching: {
            enabled: true,
          },
          parallelism: {
            enabled: true,
          },
        },
      };

      const report = versionManager.checkCompatibility(workflow, {
        features: ['caching', 'hooks'], // No loops, no parallelism
      });

      expect(report.compatible).toBe(false);
      expect(report.issues.some((i) => i.type === 'feature')).toBe(true);
    });

    it('should warn about deprecated versions', () => {
      const workflow: WorkflowDSL = {
        metadata: {
          id: 'deprecated',
          name: 'Deprecated Version',
          version: '1.0.0',
          author: 'test',
          description: 'Test deprecated version',
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

      const report = versionManager.checkCompatibility(workflow);

      expect(report.compatible).toBe(true); // Still compatible, just deprecated
      expect(report.warnings.length).toBeGreaterThan(0);
      expect(report.warnings[0].type).toBe('deprecation');
      expect(report.suggestions.length).toBeGreaterThan(0);
      expect(report.suggestions[0].type).toBe('migration');
    });
  });

  describe('migration registration', () => {
    it('should register custom migrations', async () => {
      const customMigration = {
        fromVersion: '2.0.0',
        toVersion: '2.1.0',
        changes: [
          {
            type: 'add' as const,
            path: 'customFeature',
            description: 'Added custom feature',
            breaking: false,
            automated: true,
          },
        ],
        migrate: (workflow: WorkflowDSL) => {
          (workflow as any).customFeature = { enabled: true };
          return workflow;
        },
        validate: (workflow: WorkflowDSL) => workflow.metadata.version === '2.0.0',
      };

      await versionManager.registerMigration(customMigration);

      const workflow: WorkflowDSL = {
        metadata: {
          id: 'custom-migration',
          name: 'Custom Migration',
          version: '2.0.0',
          author: 'test',
          description: 'Test custom migration',
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

      const result = await versionManager.migrateWorkflow(workflow, '2.1.0');

      expect(result.workflow.metadata.version).toBe('2.1.0');
      expect((result.workflow as any).customFeature).toBeDefined();
      expect((result.workflow as any).customFeature.enabled).toBe(true);
    });

    it('should reject invalid migration versions', async () => {
      const invalidMigration = {
        fromVersion: 'invalid',
        toVersion: '2.1.0',
        changes: [],
        migrate: (w: WorkflowDSL) => w,
        validate: () => true,
      };

      await expect(versionManager.registerMigration(invalidMigration)).rejects.toThrow(
        'Invalid version format'
      );
    });

    it('should reject backwards migrations', async () => {
      const backwardsMigration = {
        fromVersion: '2.0.0',
        toVersion: '1.0.0',
        changes: [],
        migrate: (w: WorkflowDSL) => w,
        validate: () => true,
      };

      await expect(versionManager.registerMigration(backwardsMigration)).rejects.toThrow(
        'must be from older to newer'
      );
    });
  });
});