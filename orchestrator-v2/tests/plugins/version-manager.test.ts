import { describe, it, expect, beforeEach } from '@jest/globals';
import { VersionManager } from '../../core/plugins/version-manager';
import {
  VersionInfo,
  VersionCompatibility,
  MigrationStrategy
} from '../../core/plugins/types';

describe('VersionManager', () => {
  let versionManager: VersionManager;

  beforeEach(() => {
    versionManager = new VersionManager();
  });

  describe('registerVersion', () => {
    it('should register a new version', () => {
      const versionInfo: VersionInfo = {
        pluginId: 'test-plugin',
        version: '1.0.0',
        releaseDate: new Date('2024-01-01'),
        changelog: ['Initial release'],
        breakingChanges: false
      };

      versionManager.registerVersion(versionInfo);

      const history = versionManager.getVersionHistory('test-plugin');
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(versionInfo);
    });

    it('should maintain version history in order', () => {
      const v1: VersionInfo = {
        pluginId: 'test-plugin',
        version: '1.0.0',
        releaseDate: new Date('2024-01-01'),
        changelog: ['Initial release']
      };

      const v2: VersionInfo = {
        pluginId: 'test-plugin',
        version: '2.0.0',
        releaseDate: new Date('2024-02-01'),
        changelog: ['Major update'],
        breakingChanges: true
      };

      const v1_5: VersionInfo = {
        pluginId: 'test-plugin',
        version: '1.5.0',
        releaseDate: new Date('2024-01-15'),
        changelog: ['Minor update']
      };

      versionManager.registerVersion(v1);
      versionManager.registerVersion(v2);
      versionManager.registerVersion(v1_5);

      const history = versionManager.getVersionHistory('test-plugin');
      expect(history).toHaveLength(3);

      // Should be sorted by version
      expect(history[0].version).toBe('1.0.0');
      expect(history[1].version).toBe('1.5.0');
      expect(history[2].version).toBe('2.0.0');
    });
  });

  describe('checkCompatibility', () => {
    it('should check compatibility between versions', () => {
      const compatibility = versionManager.checkCompatibility('1.0.0', '1.5.0');

      expect(compatibility.isCompatible).toBe(true);
      expect(compatibility.requiresMigration).toBe(false);
    });

    it('should detect breaking changes in major versions', () => {
      const compatibility = versionManager.checkCompatibility('1.5.0', '2.0.0');

      expect(compatibility.isCompatible).toBe(false);
      expect(compatibility.requiresMigration).toBe(true);
      expect(compatibility.breakingChanges).toContain('Major version change');
    });

    it('should handle patch version compatibility', () => {
      const compatibility = versionManager.checkCompatibility('1.0.0', '1.0.1');

      expect(compatibility.isCompatible).toBe(true);
      expect(compatibility.requiresMigration).toBe(false);
    });

    it('should handle pre-release versions', () => {
      const compatibility = versionManager.checkCompatibility('1.0.0', '1.0.0-alpha.1');

      expect(compatibility.isCompatible).toBe(true);
      expect(compatibility.warnings).toContain('Pre-release version');
    });

    it('should detect downgrade scenarios', () => {
      const compatibility = versionManager.checkCompatibility('2.0.0', '1.5.0');

      expect(compatibility.isCompatible).toBe(false);
      expect(compatibility.warnings).toContain('Downgrade detected');
    });
  });

  describe('getMigrationPath', () => {
    beforeEach(() => {
      // Register migration strategies
      versionManager.registerMigrationStrategy({
        fromVersion: '1.0.0',
        toVersion: '1.5.0',
        strategy: 'automatic',
        steps: ['Update config format'],
        estimatedDuration: 60
      });

      versionManager.registerMigrationStrategy({
        fromVersion: '1.5.0',
        toVersion: '2.0.0',
        strategy: 'manual',
        steps: ['Backup data', 'Run migration script', 'Verify'],
        estimatedDuration: 300,
        breakingChanges: ['API changes', 'Config format changes']
      });
    });

    it('should find direct migration path', () => {
      const path = versionManager.getMigrationPath('1.0.0', '1.5.0');

      expect(path).toHaveLength(1);
      expect(path[0].fromVersion).toBe('1.0.0');
      expect(path[0].toVersion).toBe('1.5.0');
      expect(path[0].strategy).toBe('automatic');
    });

    it('should find multi-step migration path', () => {
      const path = versionManager.getMigrationPath('1.0.0', '2.0.0');

      expect(path).toHaveLength(2);
      expect(path[0].fromVersion).toBe('1.0.0');
      expect(path[0].toVersion).toBe('1.5.0');
      expect(path[1].fromVersion).toBe('1.5.0');
      expect(path[1].toVersion).toBe('2.0.0');
    });

    it('should return empty array if no path exists', () => {
      const path = versionManager.getMigrationPath('3.0.0', '4.0.0');

      expect(path).toHaveLength(0);
    });

    it('should calculate total migration duration', () => {
      const path = versionManager.getMigrationPath('1.0.0', '2.0.0');
      const totalDuration = path.reduce((sum, step) => sum + (step.estimatedDuration || 0), 0);

      expect(totalDuration).toBe(360); // 60 + 300
    });
  });

  describe('validateDependencies', () => {
    it('should validate compatible dependencies', () => {
      const dependencies = {
        'plugin-a': '^1.0.0',
        'plugin-b': '~2.1.0'
      };

      const installed = {
        'plugin-a': '1.5.0',
        'plugin-b': '2.1.5'
      };

      const result = versionManager.validateDependencies(dependencies, installed);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect incompatible dependencies', () => {
      const dependencies = {
        'plugin-a': '^1.0.0',
        'plugin-b': '~2.1.0'
      };

      const installed = {
        'plugin-a': '0.9.0', // Too old
        'plugin-b': '2.2.0'  // Minor version mismatch for tilde
      };

      const result = versionManager.validateDependencies(dependencies, installed);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    it('should detect missing dependencies', () => {
      const dependencies = {
        'plugin-a': '^1.0.0',
        'plugin-b': '~2.1.0'
      };

      const installed = {
        'plugin-a': '1.5.0'
        // plugin-b is missing
      };

      const result = versionManager.validateDependencies(dependencies, installed);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing dependency: plugin-b');
    });

    it('should handle exact version requirements', () => {
      const dependencies = {
        'plugin-a': '1.2.3'
      };

      const installed1 = { 'plugin-a': '1.2.3' };
      const installed2 = { 'plugin-a': '1.2.4' };

      const result1 = versionManager.validateDependencies(dependencies, installed1);
      const result2 = versionManager.validateDependencies(dependencies, installed2);

      expect(result1.isValid).toBe(true);
      expect(result2.isValid).toBe(false);
    });
  });

  describe('getLatestVersion', () => {
    it('should return latest version for plugin', () => {
      versionManager.registerVersion({
        pluginId: 'test-plugin',
        version: '1.0.0',
        releaseDate: new Date('2024-01-01'),
        changelog: []
      });

      versionManager.registerVersion({
        pluginId: 'test-plugin',
        version: '2.0.0',
        releaseDate: new Date('2024-02-01'),
        changelog: []
      });

      versionManager.registerVersion({
        pluginId: 'test-plugin',
        version: '1.5.0',
        releaseDate: new Date('2024-01-15'),
        changelog: []
      });

      const latest = versionManager.getLatestVersion('test-plugin');
      expect(latest).toBe('2.0.0');
    });

    it('should return null for unknown plugin', () => {
      const latest = versionManager.getLatestVersion('unknown-plugin');
      expect(latest).toBeNull();
    });
  });

  describe('isVersionSupported', () => {
    beforeEach(() => {
      versionManager.setMinimumSupportedVersion('test-plugin', '1.5.0');
    });

    it('should accept supported versions', () => {
      expect(versionManager.isVersionSupported('test-plugin', '1.5.0')).toBe(true);
      expect(versionManager.isVersionSupported('test-plugin', '2.0.0')).toBe(true);
    });

    it('should reject unsupported versions', () => {
      expect(versionManager.isVersionSupported('test-plugin', '1.0.0')).toBe(false);
      expect(versionManager.isVersionSupported('test-plugin', '1.4.9')).toBe(false);
    });

    it('should handle plugins without minimum version', () => {
      expect(versionManager.isVersionSupported('other-plugin', '0.0.1')).toBe(true);
    });
  });

  describe('getUpgradeRecommendation', () => {
    beforeEach(() => {
      versionManager.registerVersion({
        pluginId: 'test-plugin',
        version: '1.0.0',
        releaseDate: new Date('2024-01-01'),
        changelog: ['Initial']
      });

      versionManager.registerVersion({
        pluginId: 'test-plugin',
        version: '1.5.0',
        releaseDate: new Date('2024-02-01'),
        changelog: ['Security fix'],
        securityFixes: true
      });

      versionManager.registerVersion({
        pluginId: 'test-plugin',
        version: '2.0.0',
        releaseDate: new Date('2024-03-01'),
        changelog: ['Major update'],
        breakingChanges: true
      });
    });

    it('should recommend security updates', () => {
      const recommendation = versionManager.getUpgradeRecommendation('test-plugin', '1.0.0');

      expect(recommendation.shouldUpgrade).toBe(true);
      expect(recommendation.urgency).toBe('high');
      expect(recommendation.targetVersion).toBe('1.5.0');
      expect(recommendation.reason).toContain('security');
    });

    it('should not force breaking changes', () => {
      const recommendation = versionManager.getUpgradeRecommendation('test-plugin', '1.5.0');

      expect(recommendation.shouldUpgrade).toBe(true);
      expect(recommendation.urgency).toBe('low');
      expect(recommendation.targetVersion).toBe('2.0.0');
      expect(recommendation.warnings).toContain('breaking changes');
    });

    it('should indicate when up to date', () => {
      const recommendation = versionManager.getUpgradeRecommendation('test-plugin', '2.0.0');

      expect(recommendation.shouldUpgrade).toBe(false);
      expect(recommendation.reason).toContain('up to date');
    });
  });
});