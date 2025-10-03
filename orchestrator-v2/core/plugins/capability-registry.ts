import {
  AgentCapability,
  CapabilityQuery,
  CapabilityMatch,
  ComplexityLevel,
  PluginCapability,
  CapabilityProvider,
  CapabilityRequirement
} from './types';

export class CapabilityRegistry {
  private capabilities: Map<string, AgentCapability> = new Map();
  private pluginCapabilities: Map<string, PluginCapability> = new Map();
  private capabilityToPlugin: Map<string, string> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();
  private keywordIndex: Map<string, Set<string>> = new Map();
  private providers: Map<string, CapabilityProvider> = new Map();
  private capabilityProviders: Map<string, CapabilityProvider[]> = new Map();

  constructor() {
    this.capabilities = new Map();
    this.pluginCapabilities = new Map();
    this.capabilityToPlugin = new Map();
    this.tagIndex = new Map();
    this.keywordIndex = new Map();
    this.providers = new Map();
    this.capabilityProviders = new Map();
  }

  // Overloaded registerCapability for compatibility
  registerCapability(capabilityOrPluginId: AgentCapability | PluginCapability | string, capability?: AgentCapability): void {
    if (typeof capabilityOrPluginId === 'string' && capability) {
      // Original signature: registerCapability(pluginId, capability)
      this.register(capability, capabilityOrPluginId);
    } else if (typeof capabilityOrPluginId === 'object') {
      // Extended signature: registerCapability(capability)
      const cap = capabilityOrPluginId;
      if ('version' in cap && !('tags' in cap)) {
        // This is a PluginCapability
        const pluginCap = cap as PluginCapability;
        this.registerPluginCapability(pluginCap);
      } else {
        // This is an AgentCapability
        this.register(cap as AgentCapability);
      }
    }
  }

  private registerPluginCapability(capability: PluginCapability): void {
    // Store in pluginCapabilities map
    this.pluginCapabilities.set(capability.id, capability);
  }

  register(capability: AgentCapability, pluginId?: string): void {
    // Validate capability
    if (!capability.id || !capability.name) {
      throw new Error('Invalid capability: missing id or name');
    }

    // Check for duplicate - silently ignore
    if (this.capabilities.has(capability.id)) {
      return; // Already registered, skip
    }

    // Store capability
    this.capabilities.set(capability.id, capability);

    if (pluginId) {
      this.capabilityToPlugin.set(capability.id, pluginId);
    }

    // Index tags
    if (capability.tags) {
      for (const tag of capability.tags) {
        if (!this.tagIndex.has(tag)) {
          this.tagIndex.set(tag, new Set());
        }
        this.tagIndex.get(tag)!.add(capability.id);
      }
    }

    // Index keywords
    if (capability.keywords) {
      for (const keyword of capability.keywords) {
        if (!this.keywordIndex.has(keyword)) {
          this.keywordIndex.set(keyword, new Set());
        }
        this.keywordIndex.get(keyword)!.add(capability.id);
      }
    }
  }

  unregister(capabilityId: string): boolean {
    const capability = this.capabilities.get(capabilityId);
    if (!capability) {
      return false;
    }

    // Remove from main storage
    this.capabilities.delete(capabilityId);
    this.capabilityToPlugin.delete(capabilityId);

    // Remove from indexes
    if (capability.tags) {
      for (const tag of capability.tags) {
        const tagSet = this.tagIndex.get(tag);
        if (tagSet) {
          tagSet.delete(capabilityId);
          if (tagSet.size === 0) {
            this.tagIndex.delete(tag);
          }
        }
      }
    }

    if (capability.keywords) {
      for (const keyword of capability.keywords) {
        const keywordSet = this.keywordIndex.get(keyword);
        if (keywordSet) {
          keywordSet.delete(capabilityId);
          if (keywordSet.size === 0) {
            this.keywordIndex.delete(keyword);
          }
        }
      }
    }

    return true;
  }

  get(capabilityId: string): AgentCapability | undefined {
    return this.capabilities.get(capabilityId);
  }

  has(capabilityId: string): boolean {
    return this.capabilities.has(capabilityId);
  }

  search(query: CapabilityQuery): CapabilityMatch[] {
    const matches = new Map<string, number>();
    const results: CapabilityMatch[] = [];

    // Search by tags
    if (query.tags && query.tags.length > 0) {
      for (const tag of query.tags) {
        const capIds = this.tagIndex.get(tag);
        if (capIds) {
          for (const id of capIds) {
            matches.set(id, (matches.get(id) || 0) + 1);
          }
        }
      }
    }

    // Search by keywords
    if (query.keywords && query.keywords.length > 0) {
      for (const keyword of query.keywords) {
        const capIds = this.keywordIndex.get(keyword);
        if (capIds) {
          for (const id of capIds) {
            matches.set(id, (matches.get(id) || 0) + 1);
          }
        }
      }
    }

    // If no tags or keywords, consider all capabilities
    if ((!query.tags || query.tags.length === 0) &&
        (!query.keywords || query.keywords.length === 0)) {
      for (const cap of this.capabilities.values()) {
        matches.set(cap.id, 0);
      }
    }

    // Filter and score capabilities
    for (const [capId, score] of matches.entries()) {
      const capability = this.capabilities.get(capId)!;

      // Filter by complexity
      if (query.complexity && capability.complexity !== query.complexity) {
        continue;
      }

      // Filter by max duration
      if (query.maxDuration && capability.estimatedDuration > query.maxDuration) {
        continue;
      }

      // Filter by permissions - find capabilities that have these permissions
      if (query.permissions && query.permissions.length > 0) {
        const hasMatchingPermissions = query.permissions.some(perm =>
          capability.requiredPermissions.includes(perm) ||
          (capability.optionalPermissions || []).includes(perm)
        );
        if (!hasMatchingPermissions) {
          continue;
        }
      }

      // Support requiredPermissions field for compatibility
      if ((query as any).requiredPermissions && (query as any).requiredPermissions.length > 0) {
        const hasMatchingPermissions = (query as any).requiredPermissions.some((perm: string) =>
          capability.requiredPermissions.includes(perm)
        );
        if (!hasMatchingPermissions) {
          continue;
        }
      }

      results.push({
        capability,
        score,
        plugin: this.capabilityToPlugin.get(capId)
      });
    }

    // Sort by score (descending)
    results.sort((a, b) => b.score - a.score);

    return results;
  }

  // Alias for compatibility
  getCapabilitiesByPlugin(pluginId: string): AgentCapability[] {
    return this.getByPlugin(pluginId);
  }

  // Alias for compatibility
  findCapabilitiesByTag(tag: string): AgentCapability[] {
    return this.getByTags([tag]);
  }

  // Alias for compatibility
  findCapabilities(query: CapabilityQuery): CapabilityMatch[] {
    return this.search(query);
  }

  getByPlugin(pluginId: string): AgentCapability[] {
    const capabilities: AgentCapability[] = [];
    for (const [capId, pId] of this.capabilityToPlugin.entries()) {
      if (pId === pluginId) {
        const capability = this.capabilities.get(capId);
        if (capability) {
          capabilities.push(capability);
        }
      }
    }
    return capabilities;
  }

  getByTags(tags: string[]): AgentCapability[] {
    const capabilityIds = new Set<string>();
    for (const tag of tags) {
      const ids = this.tagIndex.get(tag);
      if (ids) {
        for (const id of ids) {
          capabilityIds.add(id);
        }
      }
    }

    const capabilities: AgentCapability[] = [];
    for (const id of capabilityIds) {
      const capability = this.capabilities.get(id);
      if (capability) {
        capabilities.push(capability);
      }
    }

    return capabilities;
  }

  getAll(): AgentCapability[] {
    return Array.from(this.capabilities.values());
  }

  clear(): void {
    this.capabilities.clear();
    this.pluginCapabilities.clear();
    this.capabilityToPlugin.clear();
    this.tagIndex.clear();
    this.keywordIndex.clear();
    this.providers.clear();
    this.capabilityProviders.clear();
  }

  clearCapabilities(): void {
    this.capabilities.clear();
    this.pluginCapabilities.clear();
    this.capabilityToPlugin.clear();
    this.tagIndex.clear();
    this.keywordIndex.clear();
  }

  clearProviders(): void {
    this.providers.clear();
    this.capabilityProviders.clear();
  }

  size(): number {
    return this.capabilities.size;
  }

  clearPlugin(pluginId: string): void {
    const capabilities = this.getByPlugin(pluginId);
    for (const capability of capabilities) {
      this.unregister(capability.id);
    }
  }

  getAllCapabilities(): AgentCapability[] {
    return this.getAll();
  }

  getCapabilityById(id: string): AgentCapability | undefined {
    return this.get(id);
  }

  // Extended functionality for PluginCapability support
  getCapability(id: string): PluginCapability | AgentCapability | undefined {
    // First check PluginCapabilities
    const pluginCap = this.pluginCapabilities.get(id);
    if (pluginCap) {
      return pluginCap;
    }
    // Fall back to AgentCapabilities
    return this.capabilities.get(id);
  }

  // Provider management methods
  registerProvider(pluginId: string, provider: CapabilityProvider): void {
    // If re-registering, first remove from all old capability mappings
    const oldProvider = this.providers.get(pluginId);
    if (oldProvider) {
      for (const capId of oldProvider.capabilities) {
        const providers = this.capabilityProviders.get(capId);
        if (providers) {
          const index = providers.findIndex(p => p.pluginId === pluginId);
          if (index >= 0) {
            providers.splice(index, 1);
          }
          if (providers.length === 0) {
            this.capabilityProviders.delete(capId);
          }
        }
      }
    }

    // Now register the new provider
    this.providers.set(pluginId, provider);

    // Register this provider for each unique capability it provides
    const uniqueCapabilities = [...new Set(provider.capabilities)];
    for (const capId of uniqueCapabilities) {
      if (!this.capabilityProviders.has(capId)) {
        this.capabilityProviders.set(capId, []);
      }
      const providers = this.capabilityProviders.get(capId)!;
      // Only add if not already present
      if (!providers.some(p => p.pluginId === provider.pluginId)) {
        providers.push(provider);
        // Sort by priority (higher priority first)
        providers.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      }
    }
  }

  unregisterProvider(pluginId: string): boolean {
    const provider = this.providers.get(pluginId);
    if (!provider) {
      return false;
    }

    // Remove from all capability mappings
    for (const capId of provider.capabilities) {
      const providers = this.capabilityProviders.get(capId);
      if (providers) {
        const index = providers.findIndex(p => p.pluginId === pluginId);
        if (index >= 0) {
          providers.splice(index, 1);
        }
        if (providers.length === 0) {
          this.capabilityProviders.delete(capId);
        }
      }
    }

    this.providers.delete(pluginId);
    return true;
  }

  getProviders(capabilityId?: string): CapabilityProvider[] {
    if (capabilityId) {
      return this.capabilityProviders.get(capabilityId) || [];
    }
    return Array.from(this.providers.values());
  }

  getAllProviders(): CapabilityProvider[] {
    return this.getProviders();
  }

  // Capability matching methods
  matchRequirements(requirements: CapabilityRequirement[] | any[]): CapabilityProvider[] {
    if (requirements.length === 0) {
      return [];
    }

    // Find providers that satisfy ALL requirements
    const providerCounts = new Map<string, number>();
    const providerMap = new Map<string, CapabilityProvider>();
    const requiredCount = requirements.filter(r => !r.optional && r.required !== false).length;

    for (const req of requirements) {
      // Support both 'id' and 'capability' fields for backward compatibility
      const capId = req.id || req.capability;
      const isOptional = req.optional || req.required === false;
      const providers = this.getProviders(capId);

      // Filter by version if specified
      let filteredProviders = providers;
      if (req.version) {
        filteredProviders = providers.filter(p => {
          // Simple version matching (could be enhanced with semver)
          const cap = this.getCapability(capId) as PluginCapability;
          if (!cap || !cap.version) return false;

          if (req.version === '*') return true;
          if (req.version.startsWith('^') || req.version.startsWith('~')) {
            // Simple semantic version range support
            return this.isVersionCompatible(cap.version, req.version);
          }
          return cap.version === req.version;
        });
      }

      // Count how many requirements each provider satisfies
      if (filteredProviders.length > 0 || isOptional) {
        filteredProviders.forEach(p => {
          const count = providerCounts.get(p.pluginId) || 0;
          providerCounts.set(p.pluginId, count + 1);
          providerMap.set(p.pluginId, p);
        });
      } else if (!isOptional) {
        // If a required capability has no providers, return empty array
        return [];
      }
    }

    // Return providers that satisfy all required requirements
    const results: CapabilityProvider[] = [];
    for (const [pluginId, count] of providerCounts.entries()) {
      const provider = providerMap.get(pluginId)!;
      // Check if this provider satisfies all required capabilities
      if (count >= requiredCount || requiredCount === 0) {
        // Additionally check if provider actually has all required capabilities
        const hasAllRequired = requirements.every(req => {
          const capId = req.id || req.capability;
          const isOptional = req.optional || req.required === false;
          return isOptional || provider.capabilities.includes(capId);
        });

        if (hasAllRequired) {
          results.push(provider);
        }
      }
    }

    // Return sorted by priority
    return results.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  private isVersionCompatible(version: string, range: string): boolean {
    // Simple version compatibility check
    if (range === '*') return true;

    const vParts = version.split('.').map(Number);
    const rangeParts = range.replace(/^[^0-9]*/, '').split('.').map(Number);

    if (range.startsWith('^')) {
      // Compatible with same major version
      return vParts[0] === rangeParts[0] &&
             (vParts[1] > rangeParts[1] ||
              (vParts[1] === rangeParts[1] && vParts[2] >= rangeParts[2]));
    } else if (range.startsWith('~')) {
      // Compatible with same minor version
      return vParts[0] === rangeParts[0] &&
             vParts[1] === rangeParts[1] &&
             vParts[2] >= rangeParts[2];
    }

    return version === range;
  }

  listCapabilities(): string[] {
    const allIds = new Set<string>();
    for (const id of this.capabilities.keys()) {
      allIds.add(id);
    }
    for (const id of this.pluginCapabilities.keys()) {
      allIds.add(id);
    }
    return Array.from(allIds);
  }

  hasCapability(id: string): boolean {
    return this.capabilities.has(id) || this.pluginCapabilities.has(id);
  }

  unregisterCapability(id: string): boolean {
    const deleted1 = this.pluginCapabilities.delete(id);
    const deleted2 = this.unregister(id);
    return deleted1 || deleted2;
  }

  removeCapability(pluginId: string, capabilityId: string): boolean {
    // Check if the capability belongs to this plugin
    if (this.capabilityToPlugin.get(capabilityId) !== pluginId) {
      return false;
    }
    return this.unregister(capabilityId);
  }

  getCompatibilityMatrix(): Record<string, string[]> {
    const matrix: Record<string, string[]> = {};

    for (const [id1, cap1] of this.capabilities.entries()) {
      matrix[id1] = [];

      for (const [id2, cap2] of this.capabilities.entries()) {
        if (id1 === id2) continue;

        // Check various compatibility conditions
        let isCompatible = false;

        // 1. Check if they share any permissions (required or optional)
        const allPerms1 = [...cap1.requiredPermissions, ...(cap1.optionalPermissions || [])];
        const allPerms2 = [...cap2.requiredPermissions, ...(cap2.optionalPermissions || [])];

        // Check for any overlap in permissions
        const hasOverlap = allPerms1.some(p => allPerms2.includes(p));

        // 2. Check semantic compatibility based on permission patterns
        // If one does code:write and other does code:read/review, they're compatible
        const codeWriteRead =
          (cap1.requiredPermissions.includes('code:write') &&
           (cap2.requiredPermissions.includes('code:read') ||
            cap2.requiredPermissions.includes('code:review') ||
            cap2.optionalPermissions?.includes('code:review'))) ||
          (cap2.requiredPermissions.includes('code:write') &&
           (cap1.requiredPermissions.includes('code:read') ||
            cap1.requiredPermissions.includes('code:review') ||
            cap1.optionalPermissions?.includes('code:review')));

        // 3. Check if one has review in optional and other has read required (they work together)
        const reviewReadCompat =
          (cap1.optionalPermissions?.includes('code:review') &&
           cap2.requiredPermissions.includes('code:read')) ||
          (cap2.optionalPermissions?.includes('code:review') &&
           cap1.requiredPermissions.includes('code:read'));

        if (hasOverlap || codeWriteRead || reviewReadCompat) {
          matrix[id1].push(id2);
        }
      }
    }

    return matrix;
  }

  getBestMatch(query: CapabilityQuery, minScore?: number): CapabilityMatch | null {
    const matches = this.search(query);

    if (matches.length === 0) {
      return null;
    }

    const bestMatch = matches[0];

    // Check minimum score threshold if provided
    if (minScore !== undefined && bestMatch.score < minScore) {
      return null;
    }

    return bestMatch;
  }
}