import { WorkflowState, StepState } from './types.js';

export interface Todo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}

export class ProgressTracker {
  private todoUpdateCallback?: (todos: Todo[]) => Promise<void>;

  constructor(todoUpdateCallback?: (todos: Todo[]) => Promise<void>) {
    this.todoUpdateCallback = todoUpdateCallback;
  }

  async createWorkflowTodos(workflowState: WorkflowState): Promise<void> {
    if (!this.todoUpdateCallback) return;

    const todos: Todo[] = workflowState.stepStates.map((step, index) => ({
      content: this.generateStepDescription(step, index + 1),
      status: this.mapStepStatusToTodoStatus(step.status),
      activeForm: this.generateActiveForm(step, index + 1)
    }));

    await this.todoUpdateCallback(todos);
  }

  async updateWorkflowProgress(workflowState: WorkflowState): Promise<void> {
    if (!this.todoUpdateCallback) return;

    const todos: Todo[] = workflowState.stepStates.map((step, index) => ({
      content: this.generateStepDescription(step, index + 1),
      status: this.mapStepStatusToTodoStatus(step.status),
      activeForm: this.generateActiveForm(step, index + 1)
    }));

    await this.todoUpdateCallback(todos);
  }

  async completeWorkflow(workflowState: WorkflowState): Promise<void> {
    if (!this.todoUpdateCallback) return;

    // Mark all steps as completed
    const todos: Todo[] = workflowState.stepStates.map((step, index) => ({
      content: this.generateStepDescription(step, index + 1),
      status: 'completed' as const,
      activeForm: this.generateActiveForm(step, index + 1)
    }));

    // Add a final completion todo
    todos.push({
      content: `Complete ${workflowState.workflowName} workflow: ${workflowState.taskDescription}`,
      status: 'completed',
      activeForm: `Completing ${workflowState.workflowName} workflow: ${workflowState.taskDescription}`
    });

    await this.todoUpdateCallback(todos);
  }

  private generateStepDescription(step: StepState, stepNumber: number): string {
    if (step.agentName) {
      return `Step ${stepNumber}: Execute ${step.agentName} agent`;
    }
    return `Step ${stepNumber}: Execute workflow step`;
  }

  private generateActiveForm(step: StepState, stepNumber: number): string {
    if (step.agentName) {
      return `Executing ${step.agentName} agent (Step ${stepNumber})`;
    }
    return `Executing workflow step ${stepNumber}`;
  }

  private mapStepStatusToTodoStatus(stepStatus: StepState['status']): Todo['status'] {
    switch (stepStatus) {
      case 'pending':
        return 'pending';
      case 'running':
        return 'in_progress';
      case 'completed':
        return 'completed';
      case 'failed':
        return 'pending'; // Allow retry
      case 'skipped':
        return 'completed'; // Mark as done since it was skipped
      default:
        return 'pending';
    }
  }

  // Create simplified progress tracking for single-agent executions
  async trackSingleAgent(
    agentName: string,
    taskDescription: string,
    status: 'starting' | 'running' | 'completed' | 'failed'
  ): Promise<void> {
    if (!this.todoUpdateCallback) return;

    const todoStatus = status === 'starting' || status === 'running' ? 'in_progress' :
                      status === 'completed' ? 'completed' : 'pending';

    const todos: Todo[] = [{
      content: `Execute ${agentName} agent: ${taskDescription}`,
      status: todoStatus,
      activeForm: `Executing ${agentName} agent: ${taskDescription}`
    }];

    await this.todoUpdateCallback(todos);
  }

  // Track multi-step processes with detailed progress
  async trackDetailedProgress(steps: {
    name: string;
    description: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
  }[]): Promise<void> {
    if (!this.todoUpdateCallback) return;

    const todos: Todo[] = steps.map((step, index) => ({
      content: `${index + 1}. ${step.name}: ${step.description}`,
      status: this.mapStepStatusToTodoStatus(step.status),
      activeForm: `${step.status === 'running' ? 'Executing' : 'Executing'} ${step.name}: ${step.description}`
    }));

    await this.todoUpdateCallback(todos);
  }

  // Generate progress summary for complex workflows
  generateProgressSummary(workflowState: WorkflowState): {
    totalSteps: number;
    completedSteps: number;
    runningSteps: number;
    pendingSteps: number;
    failedSteps: number;
    percentage: number;
    currentStep?: string;
    estimatedTimeRemaining?: string;
  } {
    const totalSteps = workflowState.stepStates.length;
    const completedSteps = workflowState.stepStates.filter(s => s.status === 'completed').length;
    const runningSteps = workflowState.stepStates.filter(s => s.status === 'running').length;
    const pendingSteps = workflowState.stepStates.filter(s => s.status === 'pending').length;
    const failedSteps = workflowState.stepStates.filter(s => s.status === 'failed').length;

    const percentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    // Find current step
    const currentStepIndex = workflowState.currentStepIndex;
    const currentStep = currentStepIndex < workflowState.stepStates.length
      ? workflowState.stepStates[currentStepIndex]?.agentName
      : undefined;

    // Estimate time remaining based on completed steps
    let estimatedTimeRemaining: string | undefined;
    if (completedSteps > 0 && pendingSteps > 0) {
      const completedStepsWithTiming = workflowState.stepStates.filter(
        s => s.status === 'completed' && s.startTime && s.endTime
      );

      if (completedStepsWithTiming.length > 0) {
        const averageDuration = completedStepsWithTiming.reduce((sum, step) => {
          const duration = step.endTime!.getTime() - step.startTime!.getTime();
          return sum + duration;
        }, 0) / completedStepsWithTiming.length;

        const remainingTime = averageDuration * (pendingSteps + runningSteps);
        estimatedTimeRemaining = this.formatDuration(remainingTime);
      }
    }

    return {
      totalSteps,
      completedSteps,
      runningSteps,
      pendingSteps,
      failedSteps,
      percentage,
      currentStep,
      estimatedTimeRemaining
    };
  }

  private formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}