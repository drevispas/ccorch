import { WorkflowDefinition, WorkflowState, AgentExecution, WorkflowAgent, ParallelAgentGroup, ConditionalAgentGroup, AgentResult, OrchestrationConfig, StructuredAgentResult, PreviousResults } from './types.js';
import { WorkflowStateManager } from './workflow-state-manager.js';
import { WorkflowLoader } from './workflow-loader.js';
import { ProgressTracker, Todo } from './progress-tracker.js';
import { Logger } from './monitoring/logger.js';
import { MetricsCollector } from './monitoring/metrics-collector.js';
import { ClaudeIntegration, TaskParams, TodoItem } from './claude-integration.js';
import { AgentLoader } from './agent-loader.js';
import { ResultFileManager } from './result-file-manager.js';
import { UnifiedStateManager } from './unified-state-manager.js';
import { HandoverChain } from './handover-chain.js';
import { ORCHESTRATOR_CONFIG } from './config/constants.js';
import { Complexity } from './complexity-detector.js';

export class Orchestrator {
  private stateManager: WorkflowStateManager;
  public workflowLoader: WorkflowLoader;  // Made public for external access
  private config: OrchestrationConfig;
  private progressTracker: ProgressTracker;
  private logger: Logger;
  private metricsCollector: MetricsCollector;
  private claudeIntegration: ClaudeIntegration;
  private agentLoader: AgentLoader;
  private resultFileManager: ResultFileManager;
  private unifiedStateManager: UnifiedStateManager;
  private handoverChain: HandoverChain;

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
    this.resultFileManager = new ResultFileManager();
    this.unifiedStateManager = new UnifiedStateManager();
    this.handoverChain = new HandoverChain();

    // Convert Todo[] to TodoItem[] for Claude integration
    const claudeTodoCallback = todoUpdateCallback ? async (todos: TodoItem[]) => {
      const legacyTodos = todos.map(todo => ({
        content: todo.content,
        status: todo.status,
        activeForm: todo.activeForm
      })) as Todo[];
      return todoUpdateCallback(legacyTodos);
    } : undefined;

    this.claudeIntegration = new ClaudeIntegration(taskCallback, claudeTodoCallback);
  }

  async initialize(): Promise<void> {
    await this.stateManager.initialize();
    await this.workflowLoader.initialize();
    await this.logger.initialize();
    await this.metricsCollector.initialize();
    await this.resultFileManager.initialize();
    await this.unifiedStateManager.initialize();
    this.logger.info('Orchestrator initialized with unified state management');
  }

  async executeWorkflow(workflowName: string, taskDescription: string, projectDirectory?: string, complexity?: Complexity, workflowId?: string): Promise<string> {
    try {
      // Load workflow definition
      const workflow = await this.workflowLoader.loadWorkflow(workflowName);
      this.log('info', `Starting workflow: ${workflow.name}`, { workflowName, taskDescription, workflowId });

      // Create workflow state (use provided ID if available)
      const totalSteps = this.countTotalSteps(workflow.agents.sequence);
      const workflowState = await this.stateManager.createWorkflow(
        workflow.name,
        taskDescription,
        totalSteps,
        workflowId
      );

      // Create workflow directory for file-based results
      await this.resultFileManager.createWorkflowDirectory(workflowState.id);

      // Initialize progress tracking
      await this.progressTracker.createWorkflowTodos(workflowState);

      // Update state to running
      await this.stateManager.updateWorkflowStatus(workflowState.id, 'running');

      // Execute workflow sequence
      const result = await this.executeSequence(
        workflowState.id,
        workflow.agents.sequence,
        taskDescription,
        workflow.context.template,
        projectDirectory,
        complexity
      );

      // NOTE: Do not update final state or archive here - the workflow runs asynchronously
      // The orchestrator-server will handle completion and archiving when all tasks finish
      this.log('info', `Workflow started: ${workflow.name}`, { workflowId: workflowState.id });

      return `Workflow '${workflow.name}' started successfully. ID: ${workflowState.id}`;
    } catch (error) {
      this.log('error', `Workflow execution failed: ${error}`, { workflowName, error });
      throw error;
    }
  }

  async getWorkflowStatus(workflowId: string): Promise<{
    state: WorkflowState;
    progress: any;
  }> {
    const state = await this.stateManager.getState(workflowId);
    const progress = await this.stateManager.getWorkflowProgress(workflowId);
    return { state, progress };
  }

  async listActiveWorkflows(): Promise<WorkflowState[]> {
    return this.stateManager.listActiveWorkflows();
  }

  async getAvailableWorkflows(): Promise<string[]> {
    return this.workflowLoader.getWorkflowNames();
  }

  private async executeSequence(
    workflowId: string,
    sequence: AgentExecution[],
    taskDescription: string,
    contextTemplate: string,
    projectDirectory?: string,
    complexity?: Complexity
  ): Promise<string> {
    const initialContext = this.buildInitialContext(taskDescription, contextTemplate, projectDirectory);

    // FAST EXECUTION: Only create the FIRST task, subsequent tasks are created by server
    // when each task completes via the createNextTaskInSequence mechanism
    if (sequence.length > 0) {
      this.log('info', `FAST: Creating only first task in sequence, remaining tasks will be chained automatically`);

      const firstAgentExecution = sequence[0];
      const result = await this.executeAgentExecution(
        workflowId,
        0, // stepIndex
        firstAgentExecution,
        0, // currentStepIndex
        taskDescription,
        projectDirectory,
        complexity
      );

      this.log('info', `FAST: First task created, workflow will continue asynchronously as Claude executes tasks`);
    }

    // Return immediately - workflow will complete asynchronously
    return `Workflow started with first task queued. Subsequent tasks will be created automatically as agents complete.`;
  }

  private async executeAgentExecution(
    workflowId: string,
    stepIndex: number,
    agentExecution: AgentExecution,
    currentStepIndex: number,
    taskDescription: string,
    projectDirectory?: string,
    complexity?: Complexity
  ): Promise<string> {
    if ('type' in agentExecution) {
      if (agentExecution.type === 'parallel') {
        return this.executeParallelAgents(workflowId, stepIndex, agentExecution, currentStepIndex, taskDescription, projectDirectory, complexity);
      } else if (agentExecution.type === 'conditional') {
        return this.executeConditionalAgents(workflowId, stepIndex, agentExecution, currentStepIndex, taskDescription, projectDirectory, complexity);
      }
    }

    // Single agent execution
    return this.executeSingleAgent(workflowId, stepIndex, agentExecution as WorkflowAgent, currentStepIndex, taskDescription, projectDirectory, complexity);
  }

  private async executeSingleAgent(
    workflowId: string,
    stepIndex: number,
    agent: WorkflowAgent,
    currentStepIndex: number,
    taskDescription: string,
    projectDirectory?: string,
    complexity?: Complexity
  ): Promise<string> {
    this.log('info', `Executing agent: ${agent.name}`, { workflowId, stepIndex });

    // Update step state to running
    await this.stateManager.updateStepState(workflowId, stepIndex, {
      agentName: agent.name,
      status: 'running'
    });

    // Update progress tracking
    const workflowState = await this.stateManager.getState(workflowId);
    await this.progressTracker.updateWorkflowProgress(workflowState);

    // Update Claude TodoWrite integration
    const todos = this.claudeIntegration.formatTodos(
      workflowState.workflowName,
      stepIndex,
      workflowState.stepStates.length,
      agent.name,
      'in_progress'
    );
    await this.claudeIntegration.updateTodos(todos);

    try {
      const startTime = Date.now();

      // Read previous results using unified state manager
      const previousResults = await this.unifiedStateManager.getPreviousResults(workflowId, stepIndex);

      // Create handover chain for this agent (optimized)
      await this.handoverChain.createHandoverFromResults(workflowId, agent.name, stepIndex, previousResults);

      // Build context with file references instead of string concatenation
      const contextWithFiles = this.handoverChain.generateContextWithReferences(workflowId, agent.name, previousResults);

      // Build enhanced agent prompt with file references and thinking level awareness
      const prompt = await this.buildAgentPromptWithFiles(agent, contextWithFiles, previousResults, taskDescription, projectDirectory, complexity);

      // HTTP SERVER MODE: Only create the task, don't wait for execution
      // The server will handle task execution asynchronously via Claude API discovery
      const result = await this.callClaudeAgent(agent.name, prompt, complexity);


      // Check if this is a non-blocking task creation (HTTP server mode)
      const nestedResult = result.result;
      if (nestedResult &&
          typeof nestedResult === 'object' &&
          nestedResult !== null &&
          nestedResult && 'result' in nestedResult) {
        const innerResult = (nestedResult as any).result;
        if (typeof innerResult === 'string' && innerResult.includes('queued for asynchronous execution')) {
          // This is HTTP server mode - task was queued, don't complete the agent yet
          this.log('info', `Task queued for Claude discovery: ${agent.name}`, { workflowId, stepIndex });
          return `Task ${agent.name} queued for asynchronous execution by Claude`;
        }
      }

      const duration = Date.now() - startTime;

      // Convert legacy result to structured format
      const structuredResult = this.resultFileManager.convertLegacyResult(
        workflowId,
        stepIndex,
        agent.name,
        result,
        agent.description
      );

      // Save structured result to files
      const resultPaths = await this.resultFileManager.writeAgentResult(
        workflowId,
        stepIndex,
        agent.name,
        structuredResult
      );

      // Update step state to completed with file reference
      await this.stateManager.updateStepState(workflowId, stepIndex, {
        status: 'completed',
        result: `Results saved to: ${resultPaths.resultDir}`
      });

      this.log('info', `Agent completed: ${agent.name}`, {
        workflowId,
        stepIndex,
        duration,
        success: result.success,
        resultPath: resultPaths.resultDir
      });

      // Update TodoWrite with completion status
      const updatedWorkflowState = await this.stateManager.getState(workflowId);
      const completedTodos = this.claudeIntegration.formatTodos(
        updatedWorkflowState.workflowName,
        stepIndex,
        updatedWorkflowState.stepStates.length,
        agent.name,
        'completed'
      );
      await this.claudeIntegration.updateTodos(completedTodos);

      return `Agent ${agent.name} completed successfully. Results saved to: ${resultPaths.resultDir}`;
    } catch (error) {
      // Update step state to failed
      await this.stateManager.updateStepState(workflowId, stepIndex, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      });

      this.log('error', `Agent failed: ${agent.name}`, { workflowId, stepIndex, error });

      if (agent.required !== false) {
        throw error;
      }

      return `Agent ${agent.name} failed but was marked as optional: ${error}`;
    }
  }

  private async executeParallelAgents(
    workflowId: string,
    stepIndex: number,
    parallelGroup: ParallelAgentGroup,
    currentStepIndex: number,
    taskDescription: string,
    projectDirectory?: string,
    complexity?: Complexity
  ): Promise<string> {
    this.log('info', `Executing parallel agents group`, { workflowId, stepIndex, count: parallelGroup.agents.length });

    const promises = parallelGroup.agents.map(async (agent, agentIndex) => {
      const agentStepIndex = stepIndex + agentIndex;
      return this.executeSingleAgent(workflowId, agentStepIndex, agent, currentStepIndex, taskDescription, projectDirectory, complexity);
    });

    try {
      const results = await Promise.all(promises);
      return `Parallel execution completed: ${results.length} agents executed successfully`;
    } catch (error) {
      this.log('error', `Parallel agents group failed`, { workflowId, stepIndex, error });
      throw error;
    }
  }

  private async executeConditionalAgents(
    workflowId: string,
    stepIndex: number,
    conditionalGroup: ConditionalAgentGroup,
    currentStepIndex: number,
    taskDescription: string,
    projectDirectory?: string,
    complexity?: Complexity
  ): Promise<string> {
    this.log('info', `Executing conditional agents group`, { workflowId, stepIndex });

    // Handle both conditional formats:
    // 1. Standard format: { conditions: { backend_issue: {...}, frontend_issue: {...} } }
    // 2. Alternative format: { condition: "test_condition", agents: [...] }

    // Check if this is the alternative format (condition + agents)
    if ('condition' in conditionalGroup && 'agents' in conditionalGroup) {
      this.log('info', `Using alternative conditional format with condition: ${(conditionalGroup as any).condition}`, { workflowId, stepIndex });

      // Execute all agents in the agents array as a parallel group
      const agentsArray = (conditionalGroup as any).agents as WorkflowAgent[];

      if (agentsArray && agentsArray.length > 0) {
        // Create a parallel execution for all agents
        const parallelExecution: ParallelAgentGroup = {
          type: 'parallel',
          description: conditionalGroup.description,
          agents: agentsArray
        };

        return this.executeParallelAgents(workflowId, stepIndex, parallelExecution, currentStepIndex, taskDescription, projectDirectory, complexity);
      } else {
        throw new Error('No agents found in alternative conditional format');
      }
    }

    // Standard conditions format
    if (!conditionalGroup.conditions) {
      throw new Error('No conditions found in conditional agent group');
    }

    // For now, we'll implement a simple condition evaluation
    // This could be enhanced to analyze the context and determine which condition to execute
    // Use description as context since we no longer pass context strings
    const conditionKey = this.evaluateCondition(conditionalGroup.description, conditionalGroup.conditions);

    if (!conditionKey) {
      throw new Error('No matching condition found for conditional agent group');
    }

    const selectedCondition = conditionalGroup.conditions[conditionKey];
    this.log('info', `Selected condition: ${conditionKey}`, { workflowId, stepIndex });

    // Convert condition structure to AgentExecution format
    let selectedExecution: AgentExecution;

    if ('agent' in selectedCondition) {
      // Single agent condition - convert to WorkflowAgent format
      selectedExecution = {
        name: selectedCondition.agent,
        description: `Conditional execution: ${selectedCondition.agent}`,
        timeout: selectedCondition.timeout || '30m',
        required: true
      } as WorkflowAgent;
    } else {
      // Already in proper AgentExecution format
      selectedExecution = selectedCondition as AgentExecution;
    }

    return this.executeAgentExecution(workflowId, stepIndex, selectedExecution, currentStepIndex, taskDescription, projectDirectory, complexity);
  }

  private evaluateCondition(context: string, conditions: Record<string, any>): string | null {
    // Simple condition evaluation based on context content
    const contextLower = context.toLowerCase();

    if (contextLower.includes('backend') || contextLower.includes('api') || contextLower.includes('database')) {
      if ('backend_issue' in conditions) return 'backend_issue';
    }

    if (contextLower.includes('frontend') || contextLower.includes('ui') || contextLower.includes('component')) {
      if ('frontend_issue' in conditions) return 'frontend_issue';
    }

    if (contextLower.includes('full') || contextLower.includes('both') || contextLower.includes('stack')) {
      if ('full_stack_issue' in conditions) return 'full_stack_issue';
    }

    // Default to first available condition
    return Object.keys(conditions)[0] || null;
  }

  private async callClaudeAgent(agentName: string, prompt: string, complexity?: Complexity): Promise<AgentResult> {
    try {
      this.log('debug', `Calling Claude agent: ${agentName}`, { prompt: prompt.substring(0, ORCHESTRATOR_CONFIG.monitoring.promptTruncationLength) + '...' });

      if (!this.claudeIntegration.isAvailable()) {
        const error = `Claude integration not available for agent: ${agentName}`;
        this.log('error', error);
        throw new Error(error);
      }

      // Load agent definition with correct complexity
      let agentDefinition: string;
      try {
        agentDefinition = await this.agentLoader.loadAgent(agentName, complexity);
      } catch (error) {
        this.log('warn', `Failed to load agent definition for ${agentName} with complexity ${complexity}, using name only`);
        agentDefinition = `Agent: ${agentName}`;
      }

      // Create description for the task
      const description = `Execute ${agentName} agent task`;

      // Build complete prompt with agent definition
      const fullPrompt = this.claudeIntegration.buildAgentPrompt(
        agentName,
        agentDefinition,
        description,
        prompt
      );

      // Call Claude's Task tool
      const result = await this.claudeIntegration.callAgent(
        agentName,
        description,
        fullPrompt,
        complexity
      );

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: 0
      };
    }
  }

  private buildAgentPrompt(agent: WorkflowAgent, context: string, taskDescription?: string): string {
    // Legacy method - no longer using complexity section
    // New workflows should use buildAgentPromptWithFiles with thinking levels

    return `# Agent: ${agent.name}

## Task Description:
${agent.description}

## Context:
${context}

## Working Directory Rules:
- Work ONLY within the specified project directory
- If no directory is specified, use the current working directory as the project root
- Do NOT access orchestrator files or other unrelated directories

## Instructions:
Please execute this task following best practices and return your results.`;
  }

  private async buildAgentPromptWithFiles(
    agent: WorkflowAgent,
    contextWithFiles: string,
    previousResults: PreviousResults[],
    taskDescription: string,
    projectDirectory?: string,
    complexity?: Complexity
  ): Promise<string> {
    // Use passed project directory or extract it as fallback
    const workingDirectory = projectDirectory || this.extractProjectDirectory(taskDescription);

    // Load appropriate agent definition based on thinking level
    let agentDefinition = agent.description; // fallback to basic description
    try {
      if (complexity) {
        agentDefinition = await this.agentLoader.loadAgent(agent.name, complexity);
      }
    } catch (error) {
      this.log('warn', `Could not load ${complexity} agent definition for ${agent.name}, using basic description`, { error });
    }

    return `# Agent: ${agent.name}

## Task Description:
${agent.description}

## Agent Instructions:
${agentDefinition}

${contextWithFiles}

## Working Directory Rules:
- **Project Directory**: ${workingDirectory}
- Work ONLY within the specified project directory: ${workingDirectory}
- Do NOT access orchestrator files or other unrelated directories
- Focus all file operations, analysis, and recommendations within the project boundaries

## Instructions:
1. Review the previous results files listed above to understand the current state
2. Read any relevant result.json files for structured data
3. Check handover files for specific instructions from previous agents
4. Reference any artifacts created by previous agents as needed
5. Execute your task building upon the previous work
6. Save any new artifacts you create in your result directory

Please execute this task following best practices and return your results.

**Remember**: All previous agent results are now available as files. Use the file paths provided above to access specific outputs from earlier steps.`;
  }

  private buildInitialContext(taskDescription: string, template: string, projectDirectory?: string): string {
    const timestamp = new Date().toISOString();
    const workingDirectory = projectDirectory || this.extractProjectDirectory(taskDescription);

    return template
      .replace(/\{\{task_description\}\}/g, taskDescription)
      .replace(/\{\{timestamp\}\}/g, timestamp)
      .replace(/\{\{priority\|default\('medium'\)\}\}/g, 'medium')
      .replace(/\{\{focus_area\|default\('performance'\)\}\}/g, 'performance')
      .replace(/\{\{project_directory\}\}/g, workingDirectory);
  }

  private countTotalSteps(sequence: AgentExecution[]): number {
    let count = 0;

    for (const execution of sequence) {
      if ('type' in execution) {
        if (execution.type === 'parallel') {
          count += execution.agents.length;
        } else if (execution.type === 'conditional') {
          // Handle both conditional formats
          if ('conditions' in execution && execution.conditions) {
            // Standard format: { conditions: { backend_issue: {...}, frontend_issue: {...} } }
            const maxSteps = Math.max(
              ...Object.values(execution.conditions).map(condition =>
                Array.isArray((condition as any).agents)
                  ? (condition as any).agents.length
                  : 1
              )
            );
            count += maxSteps;
          } else if ('agents' in execution && (execution as any).agents) {
            // Alternative format: { condition: "test_condition", agents: [...] }
            count += (execution as any).agents.length;
          } else {
            // Fallback: assume 1 step for unknown conditional format
            count += 1;
          }
        }
      } else {
        count += 1;
      }
    }

    return count;
  }

  /**
   * Extract project directory from task description
   * Returns the specified directory path or current working directory if none specified
   */
  private extractProjectDirectory(taskDescription: string): string {
    // Look for common patterns of directory specifications
    const patterns = [
      // "on /path/to/project" or "in /path/to/project"
      /(?:on|in)\s+(\/[^\s,\.]+)/i,
      // Direct path references like "/Users/..."
      /(\/[A-Za-z][^\s,\.]*\/[^\s,\.]+)/,
      // Relative paths starting with ./ or ../
      /(\.[\/\\][^\s,\.]+)/
    ];

    for (const pattern of patterns) {
      const match = taskDescription.match(pattern);
      if (match && match[1]) {
        const path = match[1].trim();
        // Validate it looks like a reasonable directory path
        if (path.length > 1 && (path.startsWith('/') || path.startsWith('./'))) {
          this.log('info', `Extracted project directory: ${path}`);
          return path;
        }
      }
    }

    // Default to current working directory
    const cwd = process.cwd();
    this.log('info', `No explicit directory found, using current working directory: ${cwd}`);
    return cwd;
  }

  /**
   * Detect task complexity level from description to guide agent behavior
   * Returns SIMPLE, MODERATE, or COMPLEX
   */
  private detectTaskComplexity(taskDescription: string): 'SIMPLE' | 'MODERATE' | 'COMPLEX' {
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
    let complexity: 'SIMPLE' | 'MODERATE' | 'COMPLEX';
    if (simpleScore > 0) {
      complexity = 'SIMPLE';
    } else if (complexScore > moderateScore) {
      complexity = 'COMPLEX';
    } else {
      complexity = 'MODERATE';
    }

    this.log('info', `Detected task complexity: ${complexity}`, {
      simpleScore,
      complexScore,
      moderateScore,
      taskDescription: taskDescription.substring(0, 100) + '...'
    });

    return complexity;
  }

  /**
   * Generate complexity-based instructions for agents
   */
  private generateComplexityInstructions(complexity: 'SIMPLE' | 'MODERATE' | 'COMPLEX'): string {
    switch (complexity) {
      case 'SIMPLE':
        return `## Task Complexity: SIMPLE

**🛑 CRITICAL: Use ONLY the SIMPLE task template from your agent definition. Do NOT create design documents.**`;

      case 'MODERATE':
        return `## Task Complexity: MODERATE

**Guidance**: This is a standard implementation task. Please:
- Implement the requested functionality with reasonable best practices
- Include basic error handling and validation where appropriate
- Consider maintainability but don't over-engineer
- Use established patterns but keep solutions proportional to the requirements
- Balance functionality with simplicity`;

      case 'COMPLEX':
        return `## Task Complexity: COMPLEX

**Guidance**: This is a comprehensive implementation task. Please:
- Apply full expertise and industry best practices
- Implement robust error handling, security, and performance considerations
- Consider scalability, maintainability, and production readiness
- Use advanced patterns and architectures where appropriate
- Provide comprehensive solutions that meet enterprise standards`;

      default:
        return '';
    }
  }

  private log(level: string, message: string, metadata?: Record<string, any>): void {
    if (!this.config.enableMetrics) return;

    // Use the proper logger
    switch (level) {
      case 'debug':
        this.logger.debug(message, metadata);
        break;
      case 'info':
        this.logger.info(message, metadata);
        break;
      case 'warn':
        this.logger.warn(message, metadata);
        break;
      case 'error':
        this.logger.error(message, metadata?.error, metadata);
        break;
      default:
        this.logger.info(message, metadata);
    }
  }
}