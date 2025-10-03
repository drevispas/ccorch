export interface AgentConfig {
  name: string;
  type: string;
  capabilities: string[];
}

export class AgentLoader {
  private agents: Map<string, AgentConfig> = new Map();

  constructor() {
    this.initializeDefaultAgents();
  }

  private initializeDefaultAgents(): void {
    this.agents.set('code-reviewer-moderate', {
      name: 'Code Reviewer (Moderate)',
      type: 'code-reviewer-moderate',
      capabilities: ['review', 'analyze']
    });

    this.agents.set('issue-detective-simple', {
      name: 'Issue Detective (Simple)',
      type: 'issue-detective-simple',
      capabilities: ['detect', 'analyze']
    });
  }

  getAgent(type: string): AgentConfig | undefined {
    return this.agents.get(type);
  }

  listAgents(): string[] {
    return Array.from(this.agents.keys());
  }
}