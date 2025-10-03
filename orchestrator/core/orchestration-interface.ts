import { Orchestrator } from './orchestrator.js';
import { CommandParser } from './command-parser.js';
import { WorkflowLoader } from './workflow-loader.js';
import { WorkflowStateManager } from './workflow-state-manager.js';
import { OrchestrationConfig } from './types.js';

export class OrchestrationInterface {
  private orchestrator: Orchestrator;
  private commandParser: CommandParser;
  private workflowLoader: WorkflowLoader;
  private stateManager: WorkflowStateManager;
  private initialized = false;

  constructor(config?: Partial<OrchestrationConfig>) {
    this.orchestrator = new Orchestrator(config);
    this.workflowLoader = new WorkflowLoader();
    this.commandParser = new CommandParser(this.workflowLoader);
    this.stateManager = new WorkflowStateManager();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.orchestrator.initialize();
    await this.commandParser.initialize();
    this.initialized = true;
  }

  async executeCommand(command: string): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Parse the command
      const parsedCommand = await this.commandParser.parseCommand(command);

      if (!parsedCommand) {
        // If we can't parse the command, provide suggestions
        const suggestions = await this.commandParser.suggestWorkflows(command);

        if (suggestions.length === 0) {
          return this.generateHelpMessage();
        }

        return this.generateSuggestionMessage(command, suggestions);
      }

      // Execute the workflow
      const result = await this.orchestrator.executeWorkflow(
        parsedCommand.workflowType,
        parsedCommand.taskDescription
      );

      return result;
    } catch (error) {
      return `❌ Failed to execute command: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async getWorkflowStatus(workflowId?: string): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      if (workflowId) {
        const { state, progress } = await this.orchestrator.getWorkflowStatus(workflowId);
        return this.formatWorkflowStatus(state, progress);
      } else {
        const activeWorkflows = await this.orchestrator.listActiveWorkflows();
        if (activeWorkflows.length === 0) {
          return '📋 No active workflows found.';
        }
        return this.formatActiveWorkflowsList(activeWorkflows);
      }
    } catch (error) {
      return `❌ Failed to get workflow status: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async listAvailableWorkflows(): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const workflows = await this.workflowLoader.loadAllWorkflows();
      return this.formatAvailableWorkflows(workflows);
    } catch (error) {
      return `❌ Failed to list workflows: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async getHelp(): Promise<string> {
    return this.generateHelpMessage();
  }

  private generateHelpMessage(): string {
    return `# 🚀 Orchestration System Help

## How to Use

Simply describe what you want to do, and the orchestration system will automatically:
1. 🎯 Identify the appropriate workflow
2. 📋 Parse your requirements
3. ⚡ Execute the specialized agents
4. 📊 Track progress and results

## Example Commands

### 🆕 Full Feature Development
- "Implement user authentication with JWT tokens"
- "Create a shopping cart with add/remove functionality"
- "Build a file upload system with progress tracking"

### 🔧 Backend Development
- "Add Redis caching to user lookup APIs"
- "Create REST endpoints for mobile app settings"
- "Optimize database queries in the reporting module"

### 🎨 Frontend Development
- "Redesign dashboard with better navigation"
- "Add dark mode toggle to user settings"
- "Improve form validation with real-time feedback"

### 🐛 Bug Fixing & Debugging
- "Fix API returning 500 errors on profile updates"
- "Debug why users are logged out after 10 minutes"
- "Investigate slow dashboard loading times"

### 🧪 Testing & Quality
- "Test checkout flow before production deployment"
- "Validate mobile responsiveness across devices"
- "Load test APIs with 1000 concurrent users"

### 📈 Performance & Refactoring
- "Optimize dashboard performance from 5s to under 2s"
- "Refactor user service for better maintainability"
- "Reduce JavaScript bundle size by 30%"

### 🏗️ Architecture & Planning
- "Design microservice architecture for user management"
- "Plan database schema for multi-tenant application"
- "Design caching strategy for high-traffic API"

### 🚑 Emergency Hotfixes
- "CRITICAL: Payment processing is completely down"
- "URGENT: Users cannot log in, getting 500 errors"

## System Commands

- **Status**: Check current workflow progress
- **List workflows**: See all available workflow types
- **Help**: Show this help message

## Tips

- 🎯 Be specific about your requirements
- ⚡ Mention priority level (critical, urgent, high, medium, low)
- 🛠️ Include technology preferences if relevant
- 📊 Specify performance targets when applicable

Need more help? Just ask "What workflows are available?" or describe your task!`;
  }

  private generateSuggestionMessage(command: string, suggestions: any[]): string {
    let message = `❓ I couldn't automatically determine the workflow for: "${command}"\n\n`;
    message += `🎯 **Suggested workflows:**\n\n`;

    for (const suggestion of suggestions) {
      message += `**${suggestion.workflowType}** (${Math.round(suggestion.confidence)}% match)\n`;
      message += `   └─ ${suggestion.reason}\n\n`;
    }

    message += `💡 **To execute a workflow, try:**\n`;
    message += `   • "Run ${suggestions[0]?.workflowType} workflow: ${command}"\n`;
    message += `   • Or be more specific about your requirements\n\n`;
    message += `❓ Type "help" for more examples and guidance.`;

    return message;
  }

  private formatWorkflowStatus(state: any, progress: any): string {
    const statusEmoji = {
      pending: '⏳',
      running: '🔄',
      completed: '✅',
      failed: '❌',
      paused: '⏸️'
    };

    let message = `# ${statusEmoji[state.status]} Workflow Status\n\n`;
    message += `**ID:** ${state.id}\n`;
    message += `**Type:** ${state.workflowName}\n`;
    message += `**Task:** ${state.taskDescription}\n`;
    message += `**Status:** ${state.status}\n`;
    message += `**Progress:** ${progress.completed}/${progress.total} steps (${progress.percentage}%)\n`;
    message += `**Started:** ${new Date(state.startTime).toLocaleString()}\n`;

    if (state.endTime) {
      message += `**Completed:** ${new Date(state.endTime).toLocaleString()}\n`;
    }

    message += `\n## Step Details\n\n`;

    state.stepStates.forEach((step: any, index: number) => {
      const stepEmoji = statusEmoji[step.status] || '⭕';
      message += `${index + 1}. ${stepEmoji} ${step.agentName || 'TBD'} - ${step.status}\n`;

      if (step.error) {
        message += `   └─ ❌ Error: ${step.error}\n`;
      }
    });

    return message;
  }

  private formatActiveWorkflowsList(workflows: any[]): string {
    let message = `# 📋 Active Workflows\n\n`;

    workflows.forEach((workflow, index) => {
      const statusEmoji = {
        pending: '⏳',
        running: '🔄',
        completed: '✅',
        failed: '❌',
        paused: '⏸️'
      };

      message += `${index + 1}. ${statusEmoji[workflow.status]} **${workflow.workflowName}**\n`;
      message += `   └─ ID: ${workflow.id}\n`;
      message += `   └─ Task: ${workflow.taskDescription}\n`;
      message += `   └─ Started: ${new Date(workflow.startTime).toLocaleString()}\n\n`;
    });

    message += `💡 Use "workflow status <id>" to see detailed progress.`;

    return message;
  }

  private formatAvailableWorkflows(workflows: Record<string, any>): string {
    let message = `# 🛠️ Available Workflows\n\n`;

    Object.entries(workflows).forEach(([name, workflow]) => {
      message += `## ${workflow.name}\n`;
      message += `**Type:** ${name}\n`;
      message += `**Description:** ${workflow.description}\n`;
      message += `**Use Case:** ${workflow.use_case}\n`;
      message += `**Examples:**\n`;
      workflow.examples.forEach((example: string) => {
        message += `   • ${example}\n`;
      });
      message += `\n`;
    });

    message += `💡 Just describe your task and the system will automatically select the right workflow!`;

    return message;
  }
}