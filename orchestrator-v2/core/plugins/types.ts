import { ComplexityLevel, PluginStatus } from '../enums';

// Re-export for backward compatibility
export { ComplexityLevel };

export interface AgentCapability {
  id: string;
  name: string;
  description: string;
  tags: string[];
  requiredPermissions: string[];
  optionalPermissions?: string[];
  inputSchema?: any;
  outputSchema?: any;
  complexity: ComplexityLevel;
  estimatedDuration: number;
  keywords: string[];
}

export interface CapabilityQuery {
  tags?: string[];
  keywords?: string[];
  complexity?: ComplexityLevel;
  permissions?: string[];
  maxDuration?: number;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  capabilities: AgentCapability[] | string[];  // Allow string array for backward compatibility
  dependencies?: Record<string, string>;
  configSchema?: any;
  tags?: string[];
  complexityLevels?: string[];
  entryPoint?: string;
}

export interface AgentPlugin {
  manifest?: PluginManifest;
  metadata?: PluginManifest;  // Alternative name for backward compatibility
  initialize: (config?: any) => Promise<void>;
  execute: (params: any) => Promise<any>;
  destroy: () => Promise<void>;
  isInitialized?: boolean;
  getComplexityVariant?: (complexity: ComplexityLevel) => any;
}

export interface PluginConfig {
  pluginsDir?: string;
  pluginDirectory?: string;  // Alternative name
  enableAutoDiscovery?: boolean;
  requireManifest?: boolean;
  allowedPlugins?: string[];
  blockedPlugins?: string[];
  maxConcurrentLoads?: number;
  enableCaching?: boolean;
  autoReload?: boolean;
}

export interface VersionRequirement {
  min?: string;
  max?: string;
  exact?: string;
}

export interface PluginDependency {
  name: string;
  version: string | VersionRequirement;
  optional?: boolean;
}

export interface PluginLoadResult {
  success: boolean;
  plugin?: AgentPlugin;
  error?: string;
}

export interface CapabilityMatch {
  capability: AgentCapability;
  score: number;
  plugin?: string;
}

export interface PluginMetadata {
  loadedAt: Date;
  status: PluginStatus;
  error?: string;
  path?: string;
}

export interface AgentContext {
  task: string;
  complexity: ComplexityLevel;
  parameters: any;
  metadata?: Record<string, any>;
}

export interface AgentResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  complexity: ComplexityLevel;
  systemPrompt: string;
  tools: any[];
  outputFormat: string;
}
// Extended types for capability-registry-extended tests
export interface PluginCapability {
  id: string;
  name: string;
  description: string;
  version: string;
  inputSchema?: any;
  outputSchema?: any;
  metadata?: Record<string, any>;
}

export interface CapabilityProvider {
  pluginId: string;
  pluginName: string;
  capabilities: string[];
  priority?: number;
  metadata?: Record<string, any>;
}

export interface CapabilityRequirement {
  id: string;
  version?: string;
  optional?: boolean;
}

// Version management types
export interface VersionInfo {
  pluginId: string;
  version: string;
  releaseDate: Date;
  changelog: string[];
  breakingChanges?: boolean;
  securityFixes?: boolean;
  deprecated?: boolean;
}

export interface VersionCompatibility {
  compatible: boolean;
  reason?: string;
  requiresMigration?: boolean;
}

export interface MigrationStrategy {
  fromVersion: string;
  toVersion: string;
  migrate: (data: any) => any;
  description?: string;
}
