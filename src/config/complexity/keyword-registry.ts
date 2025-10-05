/**
 * Default Keyword Registry
 *
 * Purpose: Centralized keyword definitions for complexity analysis.
 * Based on PRD §5.2 keyword modifiers and scoring rubric.
 *
 * Easy to extend: Add new keywords or adjust weights without touching core logic.
 */

import type { KeywordRegistry, KeywordDefinition, NumericPattern } from './types';

// ============================================================================
// Complexity Modifiers (PRD §5.2)
// ============================================================================

const SIMPLE_MODIFIERS: KeywordDefinition[] = [
  { keyword: 'simple', weight: 0.9 },
  { keyword: 'quick', weight: 0.9 },
  { keyword: 'small', weight: 1.0, aliases: ['tiny', 'minor', 'little'] },
  { keyword: 'fix', weight: 0.7 },
  { keyword: 'add', weight: 0.6 },
  { keyword: 'rename', weight: 0.8 },
  { keyword: 'dummy', weight: 0.8 },
  { keyword: 'draft', weight: 0.7 },
  { keyword: 'easy', weight: 0.8 },
  { keyword: 'basic', weight: 0.7 },
  { keyword: 'single', weight: 0.9 },
  { keyword: 'hotfix', weight: 0.9 },
  { keyword: 'patch', weight: 0.8 },
  { keyword: 'tweak', weight: 0.7 },
];

const COMPLEX_MODIFIERS: KeywordDefinition[] = [
  { keyword: 'whole', weight: 1.2, aliases: ['entire', 'all'] },
  { keyword: 'complete', weight: 1.2 },
  { keyword: 'huge', weight: 1.3, aliases: ['massive', 'enormous'] },
  { keyword: 'large', weight: 0.9, aliases: ['big'] },
  { keyword: 'totally', weight: 0.8, aliases: ['fully', 'completely'] },
  { keyword: 'design', weight: 0.6 },  // "design" alone shouldn't be too strong
  { keyword: 'architect', weight: 0.9, aliases: ['architecture'] },
  { keyword: 'refactor', weight: 0.8 },  // Reduced so "small refactor" can be simple
  { keyword: 'migrate', weight: 1.3, aliases: ['migration'] },
  { keyword: 'enterprise', weight: 1.4 },
  { keyword: 'enterprise-grade', weight: 1.4 },
  { keyword: 'monitoring', weight: 0.8 },
  { keyword: 'solution', weight: 0.5 },
  { keyword: 'system-wide', weight: 1.3 },
  { keyword: 'full', weight: 0.8 },
  { keyword: 'comprehensive', weight: 1.1 },
  { keyword: 'greenfield', weight: 0.9 },
  { keyword: 'redesign', weight: 1.1 },
];

// ============================================================================
// Scope Indicators (PRD §5.2 Rubric)
// ============================================================================

const SINGLE_FILE_SCOPE: KeywordDefinition[] = [
  { keyword: 'file', weight: 0.8 },
  { keyword: 'function', weight: 0.9 },
  { keyword: 'method', weight: 0.9 },
  { keyword: 'class', weight: 0.7 },
  { keyword: 'component', weight: 0.7 },
  { keyword: 'single', weight: 0.9 },
  { keyword: 'one', weight: 0.7 },
  { keyword: 'variable', weight: 0.9 },
  { keyword: 'constant', weight: 0.9 },
];

const FEW_FILES_SCOPE: KeywordDefinition[] = [
  { keyword: 'few', weight: 0.7, aliases: ['couple', 'several'] },
  { keyword: 'two', weight: 0.6 },
  { keyword: 'three', weight: 0.7 },
  { keyword: 'four', weight: 0.7 },
  { keyword: 'five', weight: 0.7 },
];

const MANY_FILES_SCOPE: KeywordDefinition[] = [
  { keyword: 'multiple', weight: 0.8 },
  { keyword: 'many', weight: 0.9 },
  { keyword: 'several', weight: 0.7 },
  { keyword: 'various', weight: 0.8 },
  { keyword: 'files', weight: 0.6 },
];

const SYSTEM_SCOPE: KeywordDefinition[] = [
  { keyword: 'system', weight: 0.9 },
  { keyword: 'system-wide', weight: 1.0 },
  { keyword: 'entire', weight: 0.9, aliases: ['whole', 'all'] },
  { keyword: 'module', weight: 0.8 },
  { keyword: 'multi-module', weight: 1.0 },
  { keyword: 'service', weight: 0.7 },
  { keyword: 'microservice', weight: 0.8, aliases: ['microservices'] },
  { keyword: 'application', weight: 0.8, aliases: ['app'] },
  { keyword: 'platform', weight: 0.9 },
  { keyword: 'infrastructure', weight: 0.9 },
  { keyword: 'flow', weight: 0.6 },  // Workflows, authentication flows, etc.
];

// ============================================================================
// Dependency Indicators (PRD §5.2 Rubric)
// ============================================================================

const NO_DEPENDENCIES: KeywordDefinition[] = [
  { keyword: 'standalone', weight: 0.9 },
  { keyword: 'isolated', weight: 0.8 },
  { keyword: 'independent', weight: 0.8 },
  { keyword: 'self-contained', weight: 0.9 },
];

const FEW_DEPENDENCIES: KeywordDefinition[] = [
  { keyword: 'integrate', weight: 0.7, aliases: ['integration'] },
  { keyword: 'connect', weight: 0.6, aliases: ['connection'] },
  { keyword: 'library', weight: 0.5 },
  { keyword: 'package', weight: 0.5 },
  { keyword: 'external', weight: 0.6 },
  { keyword: 'oauth', weight: 0.7, aliases: ['oauth2'] },
];

const MANY_DEPENDENCIES: KeywordDefinition[] = [
  { keyword: 'kafka', weight: 0.8 },
  { keyword: 'redis', weight: 0.7 },
  { keyword: 'elasticsearch', weight: 0.8 },
  { keyword: 'postgres', weight: 0.7, aliases: ['postgresql', 'pg'] },
  { keyword: 'mongodb', weight: 0.7 },
  { keyword: 'rabbitmq', weight: 0.8 },
  { keyword: 'grpc', weight: 0.7 },
  { keyword: 'graphql', weight: 0.7 },
  { keyword: 'multiple services', weight: 0.9 },
  { keyword: 'third-party', weight: 0.6, aliases: ['3rd-party'] },
];

// ============================================================================
// Risk Indicators (PRD §5.2 Rubric)
// ============================================================================

const LOW_RISK: KeywordDefinition[] = [
  { keyword: 'add', weight: 0.8 },
  { keyword: 'new', weight: 0.7 },
  { keyword: 'extend', weight: 0.7, aliases: ['extension'] },
  { keyword: 'enhance', weight: 0.6, aliases: ['enhancement'] },
  { keyword: 'optional', weight: 0.8 },
  { keyword: 'feature flag', weight: 0.7, aliases: ['feature-flag'] },
];

const MEDIUM_RISK: KeywordDefinition[] = [
  { keyword: 'update', weight: 0.6 },
  { keyword: 'modify', weight: 0.7, aliases: ['modification'] },
  { keyword: 'change', weight: 0.6 },
  { keyword: 'improve', weight: 0.5 },
  { keyword: 'refine', weight: 0.5 },
  { keyword: 'optimize', weight: 0.6, aliases: ['optimization'] },
  { keyword: 'backward compatible', weight: 0.5, aliases: ['backwards compatible'] },
];

const HIGH_RISK: KeywordDefinition[] = [
  { keyword: 'migrate', weight: 1.0, aliases: ['migration'] },
  { keyword: 'refactor', weight: 0.9 },
  { keyword: 'breaking', weight: 1.0, aliases: ['breaking change'] },
  { keyword: 'schema', weight: 0.9 },
  { keyword: 'database schema', weight: 1.0 },
  { keyword: 'api change', weight: 0.9 },
  { keyword: 'contract', weight: 0.8, aliases: ['api contract'] },
  { keyword: 'deprecate', weight: 0.8, aliases: ['deprecated'] },
  { keyword: 'remove', weight: 0.7, aliases: ['delete'] },
  { keyword: 'replace', weight: 0.7, aliases: ['replacement'] },
];

// ============================================================================
// Numeric Patterns
// ============================================================================

const NUMERIC_PATTERNS: NumericPattern[] = [
  // File count: "modify 5 files", "update 10 files"
  {
    pattern: /(\d+)\s+files?/i,
    extract: (match: string) => {
      const num = match.match(/\d+/);
      return num ? parseInt(num[0], 10) : 0;
    },
    factor: 'scope',
    weight: 1.0,
  },

  // Module count: "3 modules", "across 5 services"
  {
    pattern: /(\d+)\s+(modules?|services?)/i,
    extract: (match: string) => {
      const num = match.match(/\d+/);
      return num ? parseInt(num[0], 10) : 0;
    },
    factor: 'scope',
    weight: 1.2, // Modules/services are weightier than files
  },

  // Integration count: "integrate with 3 APIs"
  {
    pattern: /(\d+)\s+(apis?|integrations?|services?|systems?)/i,
    extract: (match: string) => {
      const num = match.match(/\d+/);
      return num ? parseInt(num[0], 10) : 0;
    },
    factor: 'dependencies',
    weight: 1.0,
  },

  // Component count: "5 components", "10 pages"
  {
    pattern: /(\d+)\s+(components?|pages?|views?)/i,
    extract: (match: string) => {
      const num = match.match(/\d+/);
      return num ? parseInt(num[0], 10) : 0;
    },
    factor: 'scope',
    weight: 0.8, // Components are less weighty than modules
  },
];

// ============================================================================
// Assembled Registry
// ============================================================================

/**
 * Default keyword registry for complexity analysis
 *
 * Can be extended or overridden per-project via configuration files.
 */
export const DEFAULT_KEYWORD_REGISTRY: KeywordRegistry = {
  modifiers: {
    simple: SIMPLE_MODIFIERS,
    complex: COMPLEX_MODIFIERS,
  },

  scope: {
    single: SINGLE_FILE_SCOPE,
    few: FEW_FILES_SCOPE,
    many: MANY_FILES_SCOPE,
    system: SYSTEM_SCOPE,
  },

  dependencies: {
    none: NO_DEPENDENCIES,
    few: FEW_DEPENDENCIES,
    many: MANY_DEPENDENCIES,
  },

  risk: {
    low: LOW_RISK,
    medium: MEDIUM_RISK,
    high: HIGH_RISK,
  },

  numericPatterns: NUMERIC_PATTERNS,
};
