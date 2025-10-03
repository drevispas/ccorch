import { AgentResult } from './types.js';
import { Complexity } from './complexity-detector.js';

/**
 * Interface for integrating with Claude Code's native tools
 * This module provides methods to call Claude's Task and TodoWrite tools
 */
export class ClaudeIntegration {
  private taskCallback?: (params: TaskParams) => Promise<string>;
  private todoCallback?: (todos: TodoItem[]) => Promise<void>;

  constructor(
    taskCallback?: (params: TaskParams) => Promise<string>,
    todoCallback?: (todos: TodoItem[]) => Promise<void>
  ) {
    this.taskCallback = taskCallback;
    this.todoCallback = todoCallback;
  }

  /**
   * Call Claude's Task tool to execute a specialized agent
   */
  async callAgent(
    subagentType: string,
    description: string,
    prompt: string,
    complexity?: Complexity
  ): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      if (!this.taskCallback) {
        throw new Error('Task callback not configured. Claude integration not available.');
      }

      // Apply complexity suffix if complexity is provided and agent supports complexity variants
      let finalSubagentType = subagentType;
      if (complexity && this.supportsComplexityVariants(subagentType)) {
        finalSubagentType = `${subagentType}-${complexity}`;
      }

      const taskParams: TaskParams = {
        subagent_type: finalSubagentType,
        description,
        prompt
      };

      const result = await this.taskCallback(taskParams);

      return {
        success: true,
        result,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Update TodoWrite with current workflow progress
   */
  async updateTodos(todos: TodoItem[]): Promise<void> {
    if (!this.todoCallback) {
      // If no callback provided, we're probably in test mode
      console.log('📋 TodoWrite update:', todos.map(t => `${t.status}: ${t.content}`).join(', '));
      return;
    }

    try {
      await this.todoCallback(todos);
    } catch (error) {
      console.warn('Failed to update TodoWrite:', error);
    }
  }

  /**
   * Check if Claude integration is available
   */
  isAvailable(): boolean {
    return this.taskCallback !== undefined;
  }

  /**
   * Create a properly formatted agent prompt
   */
  buildAgentPrompt(
    agentName: string,
    agentDefinition: string,
    taskDescription: string,
    context: string
  ): string {
    // Extract project directory from context if available or use provided value
    const projectDirMatch = context.match(/Project Directory:\s*([^\n\r]+)/i);
    const contextProjectDirectory = projectDirMatch ? projectDirMatch[1].trim() : null;

    // Extract original task description for complexity detection
    const taskDescMatch = context.match(/# Task:\s*([^\n\r]+)/i);
    const originalTaskDescription = taskDescMatch ? taskDescMatch[1].trim() : taskDescription;

    // Use provided complexity if available, otherwise detect it
    const complexity = this.detectTaskComplexity(originalTaskDescription);
    const complexityInstructions = this.generateComplexityInstructions(complexity);

    // Use the first available project directory: context > current working directory
    const projectDirectory = contextProjectDirectory || 'current working directory';

    return `# Agent: ${agentName}

## Agent Definition:
${agentDefinition}

## Task Description:
${taskDescription}

## Current Context:
${context}

${complexityInstructions}

## Working Directory Rules:
- **Project Directory**: ${projectDirectory}
- Work ONLY within the specified project directory
- If no directory is specified, use the current working directory as the project root
- Do NOT access orchestrator files or other unrelated directories
- Focus all file operations within the project scope

## Instructions:
Execute this task following the agent definition and best practices. Provide clear results and any artifacts created.`;
  }

  /**
   * Detect task complexity level from description to guide agent behavior
   * Returns simple, moderate, or complex
   */
  private detectTaskComplexity(taskDescription: string): 'simple' | 'moderate' | 'complex' {
    const description = taskDescription.toLowerCase();

    // SIMPLE indicators - prioritize these
    const simpleIndicators = [
      'dummy', 'simple', 'basic', 'quick', 'minimal', 'test', 'prototype', 'mock',
      'just a', 'only a', 'single', 'one', 'small', 'tiny', 'quick test',
      'hello world', 'example', 'sample', 'demo', 'stub', 'skeleton',
      'bare minimum', 'minimal viable', 'simple test', 'basic test'
    ];

    // COMPLEX indicators
    const complexIndicators = [
      'production', 'enterprise', 'scalable', 'distributed', 'microservice',
      'full stack', 'complete system', 'comprehensive', 'robust', 'advanced',
      'security', 'authentication', 'authorization', 'monitoring', 'logging',
      'caching', 'performance', 'optimization', 'deployment', 'kubernetes',
      'docker', 'ci/cd', 'pipeline', 'database migration', 'integration',
      'multi-tenant', 'high availability', 'fault tolerant', 'load balancing'
    ];

    // MODERATE indicators
    const moderateIndicators = [
      'implement', 'create', 'build', 'develop', 'add', 'feature',
      'endpoint', 'api', 'service', 'component', 'functionality',
      'crud', 'rest', 'business logic', 'data processing'
    ];

    // Count indicators with weights
    let simpleScore = 0;
    let complexScore = 0;
    let moderateScore = 0;

    // Check simple indicators (higher weight)
    for (const indicator of simpleIndicators) {
      if (description.includes(indicator)) {
        simpleScore += 2; // Higher weight for simple indicators
      }
    }

    // Check complex indicators
    for (const indicator of complexIndicators) {
      if (description.includes(indicator)) {
        complexScore += 1;
      }
    }

    // Check moderate indicators (lower weight)
    for (const indicator of moderateIndicators) {
      if (description.includes(indicator)) {
        moderateScore += 0.5;
      }
    }

    // Determine complexity level
    let complexity: 'simple' | 'moderate' | 'complex';
    if (simpleScore > 0) {
      complexity = 'simple';
    } else if (complexScore > moderateScore) {
      complexity = 'complex';
    } else {
      complexity = 'moderate';
    }

    return complexity;
  }

  /**
   * Generate complexity-based instructions for agents
   */
  private generateComplexityInstructions(complexity: 'simple' | 'moderate' | 'complex'): string {
    switch (complexity) {
      case 'simple':
        return `## Task Complexity: simple

**🛑 CRITICAL: Follow agent's simple task template from agent definition. Do NOT create comprehensive design documents.**`;

      case 'moderate':
        return `## Task Complexity: moderate

**CRITICAL NON-DESTRUCTIVE APPROACH**:
- **ADD** new functionality WITHOUT removing existing code
- **CREATE NEW FILES** for new features rather than replacing existing ones
- **PRESERVE** all existing functionality unless explicitly asked to remove it
- **EXTEND** existing code by adding new methods/classes, not replacing them

**Implementation Guidelines**:
- Implement the requested functionality with reasonable best practices
- Include basic error handling and validation where appropriate
- Consider maintainability but don't over-engineer
- Use established patterns but keep solutions proportional to the requirements
- Balance functionality with simplicity
- Build on existing architecture without disrupting it`;

      case 'complex':
        return `## Task Complexity: complex

**CRITICAL NON-DESTRUCTIVE APPROACH**:
- **ADD** new functionality WITHOUT removing existing code
- **CREATE NEW FILES** for new features rather than replacing existing ones
- **PRESERVE** all existing functionality unless explicitly asked to remove it
- **EXTEND** existing code by adding new methods/classes, not replacing them

**Implementation Guidelines**:
- Apply full expertise and industry best practices
- Implement robust error handling, security, and performance considerations
- Consider scalability, maintainability, and production readiness
- Use advanced patterns and architectures where appropriate
- Provide comprehensive solutions that meet enterprise standards
- Enhance existing architecture without breaking current functionality`;

      default:
        return '';
    }
  }

  /**
   * Format todos for TodoWrite tool
   */
  formatTodos(
    workflowName: string,
    stepIndex: number,
    totalSteps: number,
    stepName: string,
    status: 'pending' | 'in_progress' | 'completed' | 'failed'
  ): TodoItem[] {
    const todos: TodoItem[] = [];

    // Create a todo for each step in the workflow
    for (let i = 0; i < totalSteps; i++) {
      let stepStatus: 'pending' | 'in_progress' | 'completed' = 'pending';

      if (i < stepIndex) {
        stepStatus = 'completed';
      } else if (i === stepIndex) {
        stepStatus = status === 'failed' ? 'pending' : status as any;
      }

      const isCurrentStep = i === stepIndex;
      const content = isCurrentStep ? stepName : `Step ${i + 1}`;
      const activeForm = isCurrentStep ? `Executing ${stepName}` : content;

      todos.push({
        content,
        status: stepStatus,
        activeForm
      });
    }

    return todos;
  }

  /**
   * Check if an agent supports complexity variants
   */
  private supportsComplexityVariants(agentType: string): boolean {
    // List of agents that have been split into complexity variants
    const complexityEnabledAgents = [
      'backend-architect',
      'java-backend-developer',
      'nextjs-react-developer',
      'code-reviewer',
      'e2e-test-architect',
      'issue-detective'
    ];

    return complexityEnabledAgents.includes(agentType);
  }
}

/**
 * Parameters for Claude's Task tool
 */
export interface TaskParams {
  subagent_type: string;
  description: string;
  prompt: string;
  projectDirectory?: string;
  complexity?: 'simple' | 'moderate' | 'complex';
}

/**
 * TodoWrite item structure
 */
export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}

/**
 * Factory function to create Claude integration with proper callbacks
 * This would be called from the orchestrator with actual Claude tool functions
 */
export function createClaudeIntegration(
  taskTool?: (params: TaskParams) => Promise<string>,
  todoTool?: (todos: TodoItem[]) => Promise<void>
): ClaudeIntegration {
  return new ClaudeIntegration(taskTool, todoTool);
}