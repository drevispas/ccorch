export interface ParsedCommand {
  workflowType: 'bug-fix' | 'feature-development' | 'refactoring' | 'testing' | 'code-review' | 'documentation' | 'performance-optimization' | string;
  taskDescription: string;
  complexity?: 'simple' | 'moderate' | 'complex';
  projectDirectory?: string;
  parameters?: Record<string, unknown>;
}

export class CommandParser {
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  parse(input: string): ParsedCommand | null {
    if (!input || input.trim().length === 0) {
      return null;
    }

    const lowerInput = input.toLowerCase();
    let workflowType = 'general';

    if (lowerInput.includes('fix') || lowerInput.includes('bug')) {
      workflowType = 'bug-fix';
    } else if (lowerInput.includes('feature') || lowerInput.includes('implement')) {
      workflowType = 'feature-development';
    } else if (lowerInput.includes('refactor')) {
      workflowType = 'refactoring';
    } else if (lowerInput.includes('test')) {
      workflowType = 'testing';
    }

    return {
      workflowType,
      taskDescription: input,
      complexity: 'moderate'
    };
  }

  parseCommand(input: string): ParsedCommand | null {
    return this.parse(input);
  }

  suggestWorkflows(input: string): string[] {
    const suggestions: string[] = [];
    const lowerInput = input.toLowerCase();

    if (lowerInput.includes('fix') || lowerInput.includes('bug')) {
      suggestions.push('bug-fix');
    }
    if (lowerInput.includes('feature') || lowerInput.includes('implement')) {
      suggestions.push('feature-development');
    }
    if (lowerInput.includes('refactor')) {
      suggestions.push('refactoring');
    }
    if (lowerInput.includes('test')) {
      suggestions.push('testing');
    }

    if (suggestions.length === 0) {
      suggestions.push('general');
    }

    return suggestions;
  }
}