export interface WorkflowConfig {
  name: string;
  type: string;
  tasks: any[];
  agents?: {
    sequence: Array<{ name: string; type?: string; complexity?: string }>;
  };
}

export class WorkflowLoader {
  private workflows: Map<string, WorkflowConfig> = new Map();
  private initialized: boolean = false;

  constructor() {
    this.initializeDefaultWorkflows();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initializeDefaultWorkflows();
    this.initialized = true;
  }

  private initializeDefaultWorkflows(): void {
    this.workflows.set('bug-fix', {
      name: 'Bug Fix Workflow',
      type: 'bug-fix',
      tasks: [],
      agents: {
        sequence: [
          { name: 'issue-detective', type: 'issue-detective', complexity: 'simple' },
          { name: 'code-reviewer', type: 'code-reviewer', complexity: 'simple' },
          { name: 'fix-implementer', type: 'fix-implementer', complexity: 'simple' }
        ]
      }
    });

    this.workflows.set('feature-development', {
      name: 'Feature Development Workflow',
      type: 'feature-development',
      tasks: [],
      agents: {
        sequence: [
          { name: 'backend-architect', type: 'backend-architect', complexity: 'moderate' },
          { name: 'java-backend-developer', type: 'java-backend-developer', complexity: 'moderate' },
          { name: 'code-reviewer', type: 'code-reviewer', complexity: 'moderate' }
        ]
      }
    });
  }

  getWorkflow(type: string): WorkflowConfig | undefined {
    return this.workflows.get(type);
  }

  async loadWorkflow(type: string): Promise<WorkflowConfig | undefined> {
    return this.workflows.get(type);
  }

  listWorkflows(): string[] {
    return Array.from(this.workflows.keys());
  }
}