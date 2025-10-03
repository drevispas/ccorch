import { ParsedCommand } from './types.js';
import { WorkflowLoader } from './workflow-loader.js';
import { ORCHESTRATOR_CONFIG } from './config/constants.js';

export class CommandParser {
  private workflowLoader: WorkflowLoader;
  private workflowPatterns: Map<string, RegExp[]> = new Map();

  constructor(workflowLoader: WorkflowLoader) {
    this.workflowLoader = workflowLoader;
  }

  async initialize(): Promise<void> {
    await this.buildWorkflowPatterns();
  }

  async parseCommand(command: string): Promise<ParsedCommand | null> {
    const normalizedCommand = this.normalizeCommand(command);

    // Extract priority if mentioned
    const priority = this.extractPriority(normalizedCommand);

    // Find workflow type
    const workflowType = await this.identifyWorkflowType(normalizedCommand);
    if (!workflowType) {
      return null;
    }

    // Extract task description
    const taskDescription = this.extractTaskDescription(normalizedCommand, workflowType);

    // Extract additional metadata
    const metadata = this.extractMetadata(normalizedCommand);

    return {
      workflowType,
      taskDescription,
      priority,
      metadata
    };
  }

  private normalizeCommand(command: string): string {
    return command
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  }

  private extractPriority(command: string): ParsedCommand['priority'] {
    if (command.includes('critical') || command.includes('urgent') || command.includes('emergency')) {
      return 'critical';
    }
    if (command.includes('high priority') || command.includes('important')) {
      return 'high';
    }
    if (command.includes('low priority') || command.includes('when you have time')) {
      return 'low';
    }
    return 'medium';
  }

  private async identifyWorkflowType(command: string): Promise<string | null> {
    // Check for explicit workflow type mentions
    for (const [workflowType, patterns] of this.workflowPatterns) {
      for (const pattern of patterns) {
        if (pattern.test(command)) {
          return workflowType;
        }
      }
    }

    // Fallback: semantic analysis based on keywords
    return this.semanticWorkflowIdentification(command);
  }

  private semanticWorkflowIdentification(command: string): string | null {
    // Full feature development indicators
    if (this.containsAny(command, [
      'implement', 'build', 'create', 'add new feature', 'develop',
      'full feature', 'end to end', 'complete'
    ]) && this.containsAny(command, [
      'authentication', 'dashboard', 'user management', 'shopping cart',
      'file upload', 'payment', 'notification', 'search'
    ])) {
      return 'full-feature';
    }

    // Backend-only indicators
    if (this.containsAny(command, [
      'api', 'backend', 'server', 'database', 'endpoint',
      'service', 'repository', 'cache', 'redis', 'mysql'
    ]) && !this.containsAny(command, [
      'frontend', 'ui', 'component', 'page', 'form', 'button'
    ])) {
      return 'backend-only';
    }

    // Frontend-only indicators
    if (this.containsAny(command, [
      'frontend', 'ui', 'component', 'page', 'form', 'button',
      'redesign', 'layout', 'style', 'css', 'responsive', 'mobile'
    ]) && !this.containsAny(command, [
      'api', 'backend', 'server', 'database', 'endpoint'
    ])) {
      return 'frontend-only';
    }

    // Debug/issue indicators
    if (this.containsAny(command, [
      'debug', 'fix', 'issue', 'problem', 'error', 'bug',
      'not working', 'broken', 'crash', 'fail', 'slow'
    ])) {
      return 'debug-issue';
    }

    // Testing indicators
    if (this.containsAny(command, [
      'test', 'testing', 'qa', 'quality assurance',
      'validate', 'verify', 'check'
    ])) {
      return 'test-only';
    }

    // Review/refactor indicators
    if (this.containsAny(command, [
      'review', 'refactor', 'optimize', 'improve', 'clean up',
      'performance', 'code quality', 'technical debt'
    ])) {
      return 'review-refactor';
    }

    // Architecture indicators
    if (this.containsAny(command, [
      'architecture', 'design', 'plan', 'strategy',
      'microservice', 'system design', 'scalability'
    ])) {
      return 'architecture';
    }

    // Hotfix indicators
    if (this.containsAny(command, [
      'hotfix', 'critical', 'urgent', 'production down',
      'emergency', 'immediately', 'asap'
    ])) {
      return 'hotfix';
    }

    return null;
  }

  private containsAny(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => text.includes(keyword));
  }

  private extractTaskDescription(command: string, workflowType: string): string {
    // Remove workflow trigger words to get clean task description
    let description = command;

    // Remove common workflow trigger phrases
    const triggerPhrases = [
      `run ${workflowType} workflow:`,
      `execute ${workflowType} workflow:`,
      `run ${workflowType.replace('-', ' ')} workflow:`,
      `execute ${workflowType.replace('-', ' ')} workflow:`,
      'run', 'execute', 'workflow:'
    ];

    for (const phrase of triggerPhrases) {
      description = description.replace(new RegExp(phrase, 'gi'), '');
    }

    // Remove priority indicators
    description = description.replace(/(critical|urgent|high priority|low priority|important)/gi, '');

    // Clean up whitespace and return capitalized description
    description = description.trim().replace(/\s+/g, ' ');

    if (description.length === 0) {
      return `${workflowType} task`;
    }

    // Capitalize first letter
    return description.charAt(0).toUpperCase() + description.slice(1);
  }

  private extractMetadata(command: string): Record<string, any> {
    const metadata: Record<string, any> = {};

    // Extract time constraints
    const timeMatch = command.match(/(?:within|in|by)\s+(\d+)\s*(minute|hour|day|week)s?/i);
    if (timeMatch) {
      metadata.timeConstraint = {
        value: parseInt(timeMatch[1]),
        unit: timeMatch[2].toLowerCase()
      };
    }

    // Extract technology stack mentions
    const technologies = [
      'react', 'nextjs', 'next.js', 'typescript', 'javascript',
      'java', 'spring boot', 'mysql', 'redis', 'docker',
      'kubernetes', 'aws', 'tailwind', 'shadcn'
    ];

    const mentionedTech = technologies.filter(tech =>
      command.toLowerCase().includes(tech)
    );

    if (mentionedTech.length > 0) {
      metadata.technologies = mentionedTech;
    }

    // Extract performance targets
    const performanceMatch = command.match(/(?:under|less than|<)\s*(\d+)\s*(second|millisecond|ms)s?/i);
    if (performanceMatch) {
      metadata.performanceTarget = {
        value: parseInt(performanceMatch[1]),
        unit: performanceMatch[2].toLowerCase()
      };
    }

    return metadata;
  }

  private async buildWorkflowPatterns(): Promise<void> {
    try {
      const workflows = await this.workflowLoader.loadAllWorkflows();

      for (const [workflowName, workflow] of Object.entries(workflows)) {
        const patterns: RegExp[] = [];

        // Pattern 1: Explicit workflow name mention
        patterns.push(new RegExp(`run\\s+${workflowName}\\s+workflow`, 'i'));
        patterns.push(new RegExp(`execute\\s+${workflowName}\\s+workflow`, 'i'));

        // Pattern 2: Workflow name with spaces
        const nameWithSpaces = workflowName.replace(/-/g, ' ');
        patterns.push(new RegExp(`run\\s+${nameWithSpaces}\\s+workflow`, 'i'));
        patterns.push(new RegExp(`execute\\s+${nameWithSpaces}\\s+workflow`, 'i'));

        // Pattern 3: Use case mentions
        if (workflow.use_case) {
          const useCaseWords = workflow.use_case.toLowerCase().split(/\s+/);
          if (useCaseWords.length <= 4) { // Avoid overly broad patterns
            patterns.push(new RegExp(useCaseWords.join('\\s+'), 'i'));
          }
        }

        // Pattern 4: Example-based patterns
        workflow.examples.forEach(example => {
          // Create patterns from first few words of examples
          const exampleWords = example.toLowerCase().split(/\s+/).slice(0, 3);
          if (exampleWords.length >= 2) {
            patterns.push(new RegExp(exampleWords.join('\\s+'), 'i'));
          }
        });

        this.workflowPatterns.set(workflowName, patterns);
      }
    } catch (error) {
      console.warn('Failed to build workflow patterns:', error);
    }
  }

  async suggestWorkflows(command: string): Promise<{
    workflowType: string;
    confidence: number;
    reason: string;
  }[]> {
    const normalizedCommand = command.toLowerCase();
    const suggestions: { workflowType: string; confidence: number; reason: string; }[] = [];

    try {
      const workflows = await this.workflowLoader.loadAllWorkflows();

      for (const [workflowName, workflow] of Object.entries(workflows)) {
        let confidence = 0;
        const reasons: string[] = [];

        // Check use case similarity
        if (workflow.use_case) {
          const useCaseWords = workflow.use_case.toLowerCase().split(/\s+/);
          const matchedWords = useCaseWords.filter(word => normalizedCommand.includes(word));
          const useCaseScore = matchedWords.length / useCaseWords.length;
          confidence += useCaseScore * 40;
          if (useCaseScore > 0.3) {
            reasons.push(`matches use case (${Math.round(useCaseScore * ORCHESTRATOR_CONFIG.performance.percentageBase)}%)`);
          }
        }

        // Check example similarity
        let bestExampleScore = 0;
        for (const example of workflow.examples) {
          const exampleWords = example.toLowerCase().split(/\s+/);
          const matchedWords = exampleWords.filter(word => normalizedCommand.includes(word));
          const exampleScore = matchedWords.length / exampleWords.length;
          if (exampleScore > bestExampleScore) {
            bestExampleScore = exampleScore;
          }
        }
        confidence += bestExampleScore * 40;
        if (bestExampleScore > 0.3) {
          reasons.push(`similar to examples (${Math.round(bestExampleScore * ORCHESTRATOR_CONFIG.performance.percentageBase)}%)`);
        }

        // Check description similarity
        if (workflow.description) {
          const descWords = workflow.description.toLowerCase().split(/\s+/);
          const matchedWords = descWords.filter(word => normalizedCommand.includes(word));
          const descScore = matchedWords.length / Math.min(descWords.length, 10); // Limit to first 10 words
          confidence += descScore * 20;
          if (descScore > 0.2) {
            reasons.push(`matches description (${Math.round(descScore * ORCHESTRATOR_CONFIG.performance.percentageBase)}%)`);
          }
        }

        if (confidence > ORCHESTRATOR_CONFIG.commandParsing.minSuggestionConfidence) { // Only include suggestions with some confidence
          suggestions.push({
            workflowType: workflowName,
            confidence: Math.min(confidence, ORCHESTRATOR_CONFIG.commandParsing.maxConfidence),
            reason: reasons.join(', ') || 'keyword match'
          });
        }
      }

      // Sort by confidence and return top suggestions
      return suggestions
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, ORCHESTRATOR_CONFIG.commandParsing.maxSuggestions);
    } catch (error) {
      console.warn('Failed to generate workflow suggestions:', error);
      return [];
    }
  }
}