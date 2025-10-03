import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Complexity } from './complexity-detector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Loads agent definitions from markdown files with complexity support
 */
export class AgentLoader {
  private readonly agentsDir: string;
  private readonly complexityDir: string;
  private agentCache: Map<string, string> = new Map();

  constructor() {
    this.agentsDir = join(__dirname, '../agents');
    this.complexityDir = join(__dirname, '../agents'); // Now using flat structure
  }

  /**
   * Load a specific agent definition by name and complexity level
   */
  async loadAgent(agentName: string, complexity: Complexity = 'moderate'): Promise<string> {
    if (!agentName || typeof agentName !== 'string') {
      throw new Error(`Invalid agent name: ${agentName}. Agent name must be a non-empty string.`);
    }

    if (complexity && !['simple', 'moderate', 'complex'].includes(complexity)) {
      throw new Error(`Invalid complexity level: ${complexity}. Must be 'simple', 'moderate', or 'complex'.`);
    }
    const cacheKey = `${agentName}-${complexity}`;

    // Check cache first
    if (this.agentCache.has(cacheKey)) {
      return this.agentCache.get(cacheKey)!;
    }

    // Try complexity-based agent first
    let content = await this.loadComplexityBasedAgent(agentName, complexity);

    // Fallback to moderate if not found
    if (!content && complexity !== 'moderate') {
      console.warn(`Agent definition not found for ${agentName}-${complexity}, falling back to moderate variant`);
      content = await this.loadComplexityBasedAgent(agentName, 'moderate');
    }

    // Final fallback to legacy agent
    if (!content) {
      console.warn(`No complexity variant found for ${agentName}, trying legacy agent`);
      content = await this.loadLegacyAgent(agentName);
    }

    if (!content) {
      throw new Error(`Failed to load agent '${agentName}' for complexity level '${complexity}'`);
    }

    // Cache the agent definition
    this.agentCache.set(cacheKey, content);

    return content;
  }

  /**
   * Load agent from flat complexity structure
   */
  private async loadComplexityBasedAgent(agentName: string, complexity: Complexity): Promise<string | null> {
    const fileName = `${agentName}-${complexity}.md`;
    const filePath = join(this.agentsDir, fileName);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      // File doesn't exist or can't be read
      return null;
    }
  }

  /**
   * Load agent from legacy directory (fallback)
   */
  private async loadLegacyAgent(agentName: string): Promise<string | null> {
    const filePath = join(this.agentsDir, 'old', `${agentName}.md`);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      // File doesn't exist or can't be read
      return null;
    }
  }

  /**
   * Load all available agent definitions for a specific thinking level
   */
  async loadAllAgents(complexity: Complexity = 'moderate'): Promise<Record<string, string>> {
    const agents: Record<string, string> = {};
    const agentNames = await this.getAgentNames();

    for (const agentName of agentNames) {
      try {
        agents[agentName] = await this.loadAgent(agentName, complexity);
      } catch (error) {
        // Agent loading failed - this is expected for missing variants
      }
    }

    return agents;
  }

  /**
   * Get list of available agent names from all sources
   */
  async getAgentNames(): Promise<string[]> {
    const agentNames = new Set<string>();

    try {
      const files = await fs.readdir(this.agentsDir);

      for (const file of files.filter(f => f.endsWith('.md'))) {
        // Extract agent name from complexity-based filename
        const match = file.match(/^(.+)-(simple|moderate|complex)\.md$/);
        if (match) {
          agentNames.add(match[1]);
        }
      }
    } catch (error) {
      // Directory might not exist
    }

    // Also check legacy directory
    try {
      const legacyPath = join(this.agentsDir, 'old');
      const files = await fs.readdir(legacyPath);
      for (const file of files.filter(f => f.endsWith('.md'))) {
        agentNames.add(file.replace(/\.md$/, ''));
      }
    } catch (error) {
      // Legacy directory might not exist
    }

    return Array.from(agentNames).sort();
  }

  /**
   * Check if an agent exists for a specific thinking level
   */
  async agentExists(agentName: string, complexity: Complexity = 'moderate'): Promise<boolean> {
    try {
      await this.loadAgent(agentName, complexity);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get available thinking levels for a specific agent
   */
  async getAgentComplexityLevels(agentName: string): Promise<Complexity[]> {
    const levels: Complexity[] = [];

    // Check each complexity level
    for (const level of ['simple', 'moderate', 'complex'] as Complexity[]) {
      if (await this.agentExists(agentName, level)) {
        levels.push(level);
      }
    }

    return levels;
  }

  /**
   * Extract agent metadata from markdown content
   */
  parseAgentMetadata(content: string): AgentMetadata {
    const lines = content.split('\n');
    const metadata: AgentMetadata = {
      name: '',
      description: '',
      expertise: [],
      outputs: []
    };

    let currentSection = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Extract title (first # heading)
      if (trimmed.startsWith('# ') && !metadata.name) {
        metadata.name = trimmed.substring(2);
        continue;
      }

      // Track current section
      if (trimmed.startsWith('## ')) {
        currentSection = trimmed.substring(3).toLowerCase();
        continue;
      }

      // Extract description (first paragraph after title)
      if (!metadata.description && trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('-')) {
        metadata.description = trimmed;
        continue;
      }

      // Extract list items based on current section
      if (trimmed.startsWith('- ')) {
        const item = trimmed.substring(2);

        if (currentSection.includes('expertise') || currentSection.includes('capabilities')) {
          metadata.expertise.push(item);
        } else if (currentSection.includes('output') || currentSection.includes('delivers')) {
          metadata.outputs.push(item);
        }
      }
    }

    return metadata;
  }

  /**
   * Get agent metadata for all agents
   */
  async getAllAgentMetadata(): Promise<Record<string, AgentMetadata>> {
    const agents = await this.loadAllAgents();
    const metadata: Record<string, AgentMetadata> = {};

    for (const [name, content] of Object.entries(agents)) {
      metadata[name] = this.parseAgentMetadata(content);
    }

    return metadata;
  }

  /**
   * Clear the agent cache
   */
  clearCache(): void {
    this.agentCache.clear();
  }

  /**
   * Validate that required agents exist for a workflow with specific thinking level
   */
  async validateWorkflowAgents(
    agentNames: string[],
    complexity: Complexity = 'moderate'
  ): Promise<{ valid: boolean; missing: string[]; available: string[] }> {
    const missing: string[] = [];
    const available: string[] = [];

    for (const agentName of agentNames) {
      if (await this.agentExists(agentName, complexity)) {
        available.push(agentName);
      } else {
        missing.push(agentName);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
      available
    };
  }

  /**
   * Get complexity coverage report for all agents
   */
  async getComplexityCoverage(): Promise<Record<string, {
    levels: Complexity[];
    complete: boolean;
    missing: Complexity[];
  }>> {
    const agentNames = await this.getAgentNames();
    const report: Record<string, {
      levels: Complexity[];
      complete: boolean;
      missing: Complexity[];
    }> = {};

    for (const agentName of agentNames) {
      const levels = await this.getAgentComplexityLevels(agentName);
      const requiredLevels: Complexity[] = ['simple', 'moderate', 'complex'];
      const missing = requiredLevels.filter(level => !levels.includes(level));

      report[agentName] = {
        levels,
        complete: missing.length === 0,
        missing
      };
    }

    return report;
  }
}

/**
 * Agent metadata extracted from markdown
 */
export interface AgentMetadata {
  name: string;
  description: string;
  expertise: string[];
  outputs: string[];
}