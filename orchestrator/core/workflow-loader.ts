import { WorkflowDefinition } from './types.js';
import { SchemaValidator } from './schema-validator.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class WorkflowLoader {
  private readonly workflowsDir: string;
  private workflowCache: Map<string, WorkflowDefinition> = new Map();
  private schemaValidator: SchemaValidator;

  constructor() {
    this.workflowsDir = join(__dirname, '../workflows');
    this.schemaValidator = new SchemaValidator();
  }

  async initialize(): Promise<void> {
    await this.schemaValidator.initialize();
  }

  async loadWorkflow(workflowName: string): Promise<WorkflowDefinition> {
    // Check cache first
    if (this.workflowCache.has(workflowName)) {
      return this.workflowCache.get(workflowName)!;
    }

    const filePath = join(this.workflowsDir, `${workflowName}.yaml`);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const workflow = yaml.load(content) as WorkflowDefinition;

      // Validate workflow structure using schema
      const validationResult = this.schemaValidator.validateWorkflow(workflow);
      if (!validationResult.valid) {
        const errorMessages = validationResult.errors.map(e => `${e.path}: ${e.message}`).join('; ');
        throw new Error(`Workflow validation failed: ${errorMessages}`);
      }

      // Cache the workflow
      this.workflowCache.set(workflowName, workflow);

      return workflow;
    } catch (error) {
      throw new Error(`Failed to load workflow '${workflowName}': ${error}`);
    }
  }

  async loadAllWorkflows(): Promise<Record<string, WorkflowDefinition>> {
    try {
      const files = await fs.readdir(this.workflowsDir);
      const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

      const workflows: Record<string, WorkflowDefinition> = {};

      for (const file of yamlFiles) {
        const workflowName = file.replace(/\.(yaml|yml)$/, '');
        try {
          workflows[workflowName] = await this.loadWorkflow(workflowName);
        } catch (error) {
          console.warn(`Failed to load workflow ${workflowName}:`, error);
        }
      }

      return workflows;
    } catch (error) {
      throw new Error(`Failed to load workflows directory: ${error}`);
    }
  }

  async getWorkflowNames(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.workflowsDir);
      return files
        .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
        .map(f => f.replace(/\.(yaml|yml)$/, ''));
    } catch (error) {
      return [];
    }
  }

  async findWorkflowsByUseCase(useCase: string): Promise<string[]> {
    const workflows = await this.loadAllWorkflows();
    const matches: string[] = [];

    for (const [name, workflow] of Object.entries(workflows)) {
      if (workflow.use_case.toLowerCase().includes(useCase.toLowerCase()) ||
          workflow.description.toLowerCase().includes(useCase.toLowerCase()) ||
          workflow.examples.some(example =>
            example.toLowerCase().includes(useCase.toLowerCase())
          )) {
        matches.push(name);
      }
    }

    return matches;
  }

  clearCache(): void {
    this.workflowCache.clear();
  }

  private validateWorkflow(workflow: WorkflowDefinition): void {
    if (!workflow.name) {
      throw new Error('Workflow must have a name');
    }

    if (!workflow.description) {
      throw new Error('Workflow must have a description');
    }

    if (!workflow.agents || !workflow.agents.sequence) {
      throw new Error('Workflow must have an agents sequence');
    }

    if (!Array.isArray(workflow.agents.sequence)) {
      throw new Error('Workflow agents sequence must be an array');
    }

    if (workflow.agents.sequence.length === 0) {
      throw new Error('Workflow must have at least one agent in sequence');
    }

    // Validate each agent in sequence
    workflow.agents.sequence.forEach((agent, index) => {
      this.validateAgentExecution(agent, index);
    });

    if (!workflow.context || !workflow.context.template) {
      throw new Error('Workflow must have a context template');
    }

    if (!workflow.examples || !Array.isArray(workflow.examples)) {
      throw new Error('Workflow must have examples array');
    }
  }

  private validateAgentExecution(agent: any, index: number | string): void {
    if (agent.type === 'parallel') {
      if (!agent.agents || !Array.isArray(agent.agents)) {
        throw new Error(`Parallel agent at index ${index} must have agents array`);
      }

      agent.agents.forEach((subAgent: any, subIndex: number) => {
        this.validateBasicAgent(subAgent, `${index}.${subIndex}`);
      });
    } else if (agent.type === 'conditional') {
      if (!agent.conditions || typeof agent.conditions !== 'object') {
        throw new Error(`Conditional agent at index ${index} must have conditions object`);
      }

      Object.entries(agent.conditions).forEach(([condition, conditionAgent]) => {
        this.validateAgentExecution(conditionAgent, `${index}.${condition}`);
      });
    } else {
      this.validateBasicAgent(agent, index.toString());
    }
  }

  private validateBasicAgent(agent: any, position: string): void {
    if (!agent.name) {
      throw new Error(`Agent at position ${position} must have a name`);
    }

    if (!agent.description) {
      throw new Error(`Agent ${agent.name} at position ${position} must have a description`);
    }

    if (!agent.timeout) {
      throw new Error(`Agent ${agent.name} at position ${position} must have a timeout`);
    }

    // Validate timeout format (e.g., "30m", "1h", "45s")
    if (!/^\d+[smh]$/.test(agent.timeout)) {
      throw new Error(`Agent ${agent.name} timeout must be in format like "30m", "1h", or "45s"`);
    }
  }
}