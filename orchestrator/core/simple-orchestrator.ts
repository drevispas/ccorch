import { WorkflowDefinition, WorkflowState, AgentExecution, WorkflowAgent, ParallelAgentGroup, ConditionalAgentGroup, AgentResult, OrchestrationConfig, StructuredAgentResult, PreviousResults } from './types.js';
import { WorkflowStateManager } from './workflow-state-manager.js';
import { WorkflowLoader } from './workflow-loader.js';
import { ProgressTracker, Todo } from './progress-tracker.js';
import { Logger } from './monitoring/logger.js';
import { MetricsCollector } from './monitoring/metrics-collector.js';
import { ClaudeIntegration, TaskParams, TodoItem } from './claude-integration.js';
import { AgentLoader } from './agent-loader.js';
import { SimplifiedStateManager } from './simplified-state-manager.js';
import { ORCHESTRATOR_CONFIG } from './config/constants.js';
import { Complexity } from './complexity-detector.js';

/**
 * SimpleOrchestrator - A streamlined version using SimplifiedStateManager
 *
 * This orchestrator eliminates the complex multi-manager approach and uses
 * a single SimplifiedStateManager for all state operations.
 *
 * Key differences from the original Orchestrator:
 * - Single state manager instead of 3 separate managers
 * - Simplified result handling without complex handover chains
 * - Flatter file structure
 * - Reduced code complexity
 */
export class SimpleOrchestrator {
  private stateManager: WorkflowStateManager;
  public workflowLoader: WorkflowLoader;  // Made public for external access
  private config: OrchestrationConfig;
  private progressTracker: ProgressTracker;
  private logger: Logger;
  private metricsCollector: MetricsCollector;
  private claudeIntegration: ClaudeIntegration;
  private agentLoader: AgentLoader;
  private simplifiedStateManager: SimplifiedStateManager;

  constructor(
    config?: Partial<OrchestrationConfig>,
    todoUpdateCallback?: (todos: Todo[]) => Promise<void>,
    taskCallback?: (params: TaskParams) => Promise<string>
  ) {
    this.config = {
      maxConcurrentAgents: ORCHESTRATOR_CONFIG.defaults.maxConcurrentAgents,
      defaultTimeout: ORCHESTRATOR_CONFIG.timeouts.defaultWorkflow,
      retryAttempts: ORCHESTRATOR_CONFIG.defaults.retryAttempts,
      retryDelay: ORCHESTRATOR_CONFIG.timeouts.retryDelay,
      enableMetrics: ORCHESTRATOR_CONFIG.defaults.enableMetrics,
      logLevel: ORCHESTRATOR_CONFIG.defaults.logLevel,
      ...config
    };

    this.stateManager = new WorkflowStateManager();
    this.workflowLoader = new WorkflowLoader();
    this.progressTracker = new ProgressTracker(todoUpdateCallback);
    this.logger = new Logger(this.config);
    this.metricsCollector = new MetricsCollector(this.config);
    this.agentLoader = new AgentLoader();
    this.simplifiedStateManager = new SimplifiedStateManager();

    // Convert Todo[] to TodoItem[] for Claude integration
    const todoItemCallback = todoUpdateCallback ? async (todos: Todo[]) => {
      await todoUpdateCallback(todos);
    } : undefined;

    this.claudeIntegration = new ClaudeIntegration(taskCallback, todoItemCallback);
  }

  async initialize(): Promise<void> {
    await this.stateManager.initialize();
    await this.workflowLoader.initialize();
    await this.logger.initialize();
    await this.metricsCollector.initialize();
    await this.simplifiedStateManager.initialize();
    this.logger.info('SimpleOrchestrator initialized with simplified state management');
  }

  async executeWorkflow(
    workflowDefinition: WorkflowDefinition,
    taskDescription: string,
    context: Record<string, any> = {}
  ): Promise<AgentResult> {
    const workflowId = context.workflowId || this.generateWorkflowId();
    this.logger.info(`Starting simplified workflow execution: ${workflowDefinition.name} (${workflowId})`);

    try {
      // Create workflow state
      const totalSteps = workflowDefinition.agents.sequence.length;
      const workflowState = await this.stateManager.createWorkflow(
        workflowDefinition.name,
        taskDescription,
        totalSteps,
        workflowId
      );

      // Extract agent names for simplified state
      const baseAgentNames = this.extractAgentNames(workflowDefinition.agents.sequence);

      // Get complexity and apply to agent names for state tracking
      const complexity = (context.complexity as Complexity) || 'moderate';
      if (!context.complexity) {
        this.logger.warn('Missing complexity in context, using moderate fallback', { workflowId: workflowId });
      }
      const agentNamesWithComplexity = baseAgentNames.map(name =>
        this.getAgentNameWithComplexity(name, complexity)
      );

      // Create workflow in simplified state manager
      await this.simplifiedStateManager.createWorkflow(
        workflowId,
        workflowDefinition.name,
        taskDescription,
        agentNamesWithComplexity
      );

      // Update workflow to running status
      await this.simplifiedStateManager.updateWorkflowStatus(workflowId, 'running');

      // Initialize progress tracking
      await this.progressTracker.createWorkflowTodos(workflowState);

      // Execute agents sequentially
      const result = await this.executeAgentSequence(
        workflowDefinition.agents.sequence,
        workflowId,
        taskDescription,
        context
      );

      // Mark workflow as completed
      await this.simplifiedStateManager.updateWorkflowStatus(workflowId, 'completed');
      await this.stateManager.updateWorkflowStatus(workflowId, 'completed');

      this.logger.info(`Workflow completed successfully: ${workflowId}`);
      return result;

    } catch (error) {
      this.logger.error(`Workflow failed: ${workflowId}`, error);
      await this.simplifiedStateManager.updateWorkflowStatus(workflowId, 'failed');
      await this.stateManager.updateWorkflowStatus(workflowId, 'failed');
      throw error;
    }
  }

  private async executeAgentSequence(
    sequence: AgentExecution[],
    workflowId: string,
    taskDescription: string,
    context: Record<string, any>
  ): Promise<AgentResult> {
    let lastResult: AgentResult = { success: true, result: '', duration: 0 };

    for (let i = 0; i < sequence.length; i++) {
      const execution = sequence[i];

      if (this.isWorkflowAgent(execution)) {
        lastResult = await this.executeAgent(execution, i + 1, workflowId, taskDescription, context);
      } else if (this.isParallelAgentGroup(execution)) {
        lastResult = await this.executeParallelAgents(execution, i + 1, workflowId, taskDescription, context);
      } else if (this.isConditionalAgentGroup(execution)) {
        lastResult = await this.executeConditionalAgents(execution, i + 1, workflowId, taskDescription, context);
      }

      if (!lastResult.success) {
        throw new Error(`Agent execution failed at step ${i + 1}: ${lastResult.error}`);
      }
    }

    return lastResult;
  }

  private async executeAgent(
    agent: WorkflowAgent,
    stepIndex: number,
    workflowId: string,
    taskDescription: string,
    context: Record<string, any>
  ): Promise<AgentResult> {
    this.logger.info(`Executing agent: ${agent.name} (step ${stepIndex})`);

    try {
      // Get complexity early for consistent agent loading and execution
      const complexity = (context.complexity as Complexity) || 'moderate';
      if (!context.complexity) {
        this.logger.warn('Missing complexity in context for agent execution, using moderate fallback', {
          workflowId: workflowId,
          agentName: agent.name
        });
      }

      // Calculate the final agent name with complexity suffix for state tracking
      const finalAgentName = this.getAgentNameWithComplexity(agent.name, complexity);

      // Update agent status to running
      await this.simplifiedStateManager.updateAgentStatus(workflowId, finalAgentName, 'running');

      // Get previous results for context
      const previousResults = await this.getPreviousResults(workflowId, stepIndex);

      // Build context string from previous results
      const contextString = this.buildContextFromResults(previousResults);

      // Get agent definition with the correct complexity level
      const agentDefinition = await this.agentLoader.loadAgent(agent.name, complexity);
      if (!agentDefinition) {
        throw new Error(`Agent definition not found: ${agent.name}`);
      }

      // Build agent prompt
      const agentPrompt = this.buildAgentPrompt(
        agent,
        agentDefinition,
        taskDescription,
        contextString,
        context
      );

      // Execute agent via Claude integration
      const startTime = Date.now();
      const result = await this.claudeIntegration.callAgent(
        agent.name,
        `Execute ${agent.name} agent task`,
        agentPrompt,
        complexity
      );

      const duration = Date.now() - startTime;

      // Create structured result
      const resultString = result.success ? (result.result || '') : (result.error || 'Agent execution failed');
      const structuredResult: StructuredAgentResult = {
        agent: agent.name,
        timestamp: new Date().toISOString(),
        status: result.success ? 'completed' : 'failed',
        stepIndex,
        workflowId,
        output: {
          result: [resultString],
          success: result.success
        },
        handover: {
          keyPoints: this.extractKeyPoints(resultString),
          instructions: `Execute ${agent.name} agent task`
        },
        metrics: {
          duration,
          filesCreated: 0
        }
      };

      // Save result to simplified state
      await this.simplifiedStateManager.saveAgentResult(workflowId, finalAgentName, structuredResult);

      // Update agent status
      await this.simplifiedStateManager.updateAgentStatus(workflowId, finalAgentName, result.success ? 'completed' : 'failed', {
        success: result.success,
        result: resultString,
        duration
      });

      this.logger.info(`Agent completed: ${agent.name}`);

      return {
        success: result.success,
        result: resultString,
        duration
      };

    } catch (error) {
      this.logger.error(`Agent failed: ${agent.name}`, error);

      // Get complexity for consistent state updates
      const complexity = (context.complexity as Complexity) || 'moderate';
      if (!context.complexity) {
        this.logger.warn('Missing complexity in context for error handling, using moderate fallback', {
          workflowId: workflowId,
          agentName: agent.name
        });
      }
      const finalAgentName = this.getAgentNameWithComplexity(agent.name, complexity);

      // Update agent status to failed
      await this.simplifiedStateManager.updateAgentStatus(workflowId, finalAgentName, 'failed', {
        success: false,
        error: (error as Error).message,
        duration: 0
      });

      return {
        success: false,
        error: (error as Error).message,
        duration: 0
      };
    }
  }

  private async executeParallelAgents(
    group: ParallelAgentGroup,
    stepIndex: number,
    workflowId: string,
    taskDescription: string,
    context: Record<string, any>
  ): Promise<AgentResult> {
    this.logger.info(`Executing parallel agent group with ${group.agents.length} agents`);

    const promises = group.agents.map((agent, index) =>
      this.executeAgent(agent, stepIndex + index, workflowId, taskDescription, context)
    );

    const results = await Promise.allSettled(promises);

    // Check if all succeeded
    const allSucceeded = results.every(result =>
      result.status === 'fulfilled' && result.value.success
    );

    if (allSucceeded) {
      const lastResult = results[results.length - 1] as PromiseFulfilledResult<AgentResult>;
      return lastResult.value;
    } else {
      const errors = results
        .filter(result => result.status === 'rejected' || !result.value.success)
        .map(result => result.status === 'rejected' ? result.reason : result.value.error);

      return {
        success: false,
        error: `Parallel execution failed: ${errors.join(', ')}`,
        duration: 0
      };
    }
  }

  private async executeConditionalAgents(
    group: ConditionalAgentGroup,
    stepIndex: number,
    workflowId: string,
    taskDescription: string,
    context: Record<string, any>
  ): Promise<AgentResult> {
    // Simplified conditional logic - just execute the first condition
    const firstCondition = Object.values(group.conditions)[0];

    if (this.isWorkflowAgent(firstCondition)) {
      return this.executeAgent(firstCondition, stepIndex, workflowId, taskDescription, context);
    }

    return {
      success: false,
      error: 'Conditional agent execution not fully implemented',
      duration: 0
    };
  }

  private async getPreviousResults(workflowId: string, currentStep: number) {
    return await this.simplifiedStateManager.getWorkflowResults(workflowId);
  }

  private buildContextFromResults(results: any[]): string {
    if (!results || results.length === 0) {
      return 'No previous results available.';
    }

    return results
      .map((result, index) => {
        const header = `## Agent: ${result.agentName}`;
        const output = result.output || 'No output available.';
        return `${header}\n\n${output}\n`;
      })
      .join('\n---\n\n');
  }

  private buildAgentPrompt(
    agent: WorkflowAgent,
    agentDefinition: string,
    taskDescription: string,
    context: string,
    workflowContext: Record<string, any>
  ): string {
    const basePrompt = `# Agent: ${agent.name}

## Agent Definition:
${agentDefinition}

## Task Description:
${taskDescription}

## Current Context:
${context}

## Task Complexity: ${workflowContext.taskComplexity || 'MODERATE'}

## Working Directory Rules:
- **Project Directory**: ${workflowContext.projectDirectory || process.cwd()}.
- Work ONLY within the specified project directory
- Focus all file operations within the project scope

## Instructions:
Execute this task following the agent definition and best practices. Provide clear results and any artifacts created.`;

    return basePrompt;
  }

  private extractKeyPoints(result: string): string[] {
    // Simple key point extraction - split by major headings
    const lines = result.split('\n');
    const keyPoints = lines
      .filter(line => line.trim().startsWith('##') || line.trim().startsWith('*') || line.trim().startsWith('-'))
      .map(line => line.replace(/^[#\-*\s]+/, '').trim())
      .filter(line => line.length > 0)
      .slice(0, 10); // Limit to 10 key points

    return keyPoints.length > 0 ? keyPoints : [result.slice(0, 200) + '...'];
  }

  private extractAgentNames(sequence: AgentExecution[]): string[] {
    const names: string[] = [];

    for (const execution of sequence) {
      if (this.isWorkflowAgent(execution)) {
        names.push(execution.name);
      } else if (this.isParallelAgentGroup(execution)) {
        names.push(...execution.agents.map(agent => agent.name));
      } else if (this.isConditionalAgentGroup(execution)) {
        // Add names from first condition for simplicity
        const firstCondition = Object.values(execution.conditions)[0];
        if (this.isWorkflowAgent(firstCondition)) {
          names.push(firstCondition.name);
        }
      }
    }

    return names;
  }

  /**
   * Get agent name with complexity suffix if supported
   */
  private getAgentNameWithComplexity(agentName: string, complexity: Complexity): string {
    // List of agents that have been split into complexity variants
    const complexityEnabledAgents = [
      'backend-architect',
      'java-backend-developer',
      'nextjs-react-developer',
      'code-reviewer',
      'e2e-test-architect',
      'issue-detective'
    ];

    if (complexityEnabledAgents.includes(agentName)) {
      return `${agentName}-${complexity}`;
    }

    return agentName;
  }

  private generateWorkflowId(): string {
    return `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Type guard functions
  private isWorkflowAgent(execution: any): execution is WorkflowAgent {
    return execution && typeof execution === 'object' && 'name' in execution;
  }

  private isParallelAgentGroup(execution: any): execution is ParallelAgentGroup {
    return execution && execution.type === 'parallel';
  }

  private isConditionalAgentGroup(execution: any): execution is ConditionalAgentGroup {
    return execution && execution.type === 'conditional';
  }

  // Public methods for external access
  async getWorkflowStatus(workflowId: string) {
    return await this.simplifiedStateManager.getWorkflowState(workflowId);
  }

  async getWorkflowResults(workflowId: string) {
    return await this.simplifiedStateManager.getWorkflowResults(workflowId);
  }

  async listWorkflows() {
    return await this.simplifiedStateManager.listWorkflows();
  }
}