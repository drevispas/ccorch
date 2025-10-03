import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { HandoverData, PreviousResults } from './types.js';
import { ServerLogger } from './server-logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface HandoverLink {
  fromAgent: string;
  toAgent: string;
  stepIndex: number;
  data: HandoverData;
  timestamp: string;
  filePath: string;
}

/**
 * HandoverChain manages curated context transfer between agents in a workflow.
 *
 * This class manages HANDOVER FILES (not result files) which facilitate
 * inter-agent communication by providing curated, relevant context from
 * previous agents to subsequent agents. Handover files include:
 * - Key points and highlights from previous work
 * - Specific instructions for the next agent
 * - Structured data that needs to be passed forward
 * - Dependencies on previous agents' work
 *
 * These files are used for:
 * - Active agent-to-agent communication during workflow execution
 * - Providing focused context without overwhelming details
 * - Supporting parallel agent coordination
 * - Maintaining workflow continuity
 *
 * For complete agent outputs and historical records, see ResultFileManager
 * class which manages the permanent archive of all agent work.
 */
export class HandoverChain {
  private readonly workflowsBaseDir: string;
  private logger?: ServerLogger;

  constructor(logger?: ServerLogger) {
    this.workflowsBaseDir = join(__dirname, '../state');
    this.logger = logger;
  }

  /**
   * Create explicit handover file to transfer curated context between agents.
   *
   * Creates both structured (JSON) and human-readable (Markdown) handover files
   * that contain only the essential information the next agent needs to know.
   * This is separate from the complete result files and focuses on actionable
   * context for the receiving agent.
   *
   * Files created:
   * - {stepIndex}-{fromAgent}-to-{toAgent}.json: Structured handover data
   * - {stepIndex}-{fromAgent}-to-{toAgent}.md: Human-readable version
   *
   * @param workflowId - Unique workflow identifier
   * @param fromAgent - Source agent that completed work
   * @param toAgent - Target agent that will receive this context
   * @param stepIndex - Position in workflow sequence
   * @param data - Curated handover data with key points and instructions
   * @returns Path to the created JSON handover file
   */
  async createHandover(
    workflowId: string,
    fromAgent: string,
    toAgent: string,
    stepIndex: number,
    data: HandoverData
  ): Promise<string> {
    const workflowDir = join(this.workflowsBaseDir, 'active', workflowId);
    const handoverDir = join(workflowDir, 'handover');

    await this.ensureDirectoryExists(handoverDir);

    const handoverFileName = `${String(stepIndex).padStart(2, '0')}-${fromAgent}-to-${toAgent}.json`;
    const handoverFilePath = join(handoverDir, handoverFileName);

    const handoverLink: HandoverLink = {
      fromAgent,
      toAgent,
      stepIndex,
      data,
      timestamp: new Date().toISOString(),
      filePath: handoverFilePath
    };

    // Process handover data for better readability
    const processedLink = this.processHandoverForReadability(handoverLink);
    await fs.writeFile(handoverFilePath, JSON.stringify(processedLink, null, 2));

    if (this.logger) {
      this.logger.logWithContext('info', 'WORKFLOW', `Created handover from ${fromAgent} to ${toAgent}: ${handoverFilePath}`);
    }
    return handoverFilePath;
  }

  /**
   * Read handover instructions for an agent
   */
  async readHandover(
    workflowId: string,
    forAgent: string,
    fromStep?: number
  ): Promise<HandoverData[]> {
    const workflowDir = join(this.workflowsBaseDir, 'active', workflowId);
    const handoverDir = join(workflowDir, 'handover');

    try {
      const files = await fs.readdir(handoverDir);
      const handoverFiles = files.filter(f => f.endsWith('.json'));
      const handovers: HandoverData[] = [];

      for (const file of handoverFiles) {
        const filePath = join(handoverDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const handoverLink = JSON.parse(content) as HandoverLink;

        // Check if this handover is for the target agent
        if (handoverLink.toAgent === forAgent || handoverLink.data.forAgent.includes(forAgent)) {
          // If fromStep is specified, only include handovers from that step or earlier
          if (fromStep === undefined || handoverLink.stepIndex <= fromStep) {
            handovers.push(handoverLink.data);
          }
        }
      }

      return handovers.sort((a, b) => {
        const aFile = handoverFiles.find(f => f.includes(a.forAgent[0]));
        const bFile = handoverFiles.find(f => f.includes(b.forAgent[0]));
        return (aFile || '').localeCompare(bFile || '');
      });
    } catch (error) {
      if (this.logger) {
        this.logger.logWithContext('warn', 'WORKFLOW', `Could not read handover files for ${forAgent}: ${error}`);
      }
      return [];
    }
  }

  /**
   * Create handover data from previous results
   */
  async createHandoverFromResults(
    workflowId: string,
    currentAgent: string,
    currentStep: number,
    previousResults: PreviousResults[]
  ): Promise<void> {
    if (previousResults.length === 0) return;

    // Skip creating separate workflow-results.json - this data is now embedded in individual handovers

    // Create individual handover files from each previous agent to current agent
    for (const prevResult of previousResults) {
      if (!prevResult.available) continue;

      // Skip self-handover (agent to itself)
      if (prevResult.agent === currentAgent) {
        if (this.logger) {
          this.logger.logWithContext('debug', 'WORKFLOW', `Skipping self-handover from ${prevResult.agent} to ${currentAgent}`);
        }
        continue;
      }

      const handoverData: HandoverData = {
        forAgent: [currentAgent],
        keyPoints: prevResult.result.handover?.keyPoints || [],
        dependencies: prevResult.result.handover?.dependencies || [],
        data: prevResult.result.handover?.data || {},
        instructions: prevResult.result.handover?.instructions || `Execute ${currentAgent} agent task`
      };

      // Only create handover if there's meaningful content
      const hasContent = handoverData.keyPoints.length > 0 ||
                        handoverData.dependencies.length > 0 ||
                        Object.keys(handoverData.data).length > 0 ||
                        (handoverData.instructions && handoverData.instructions !== `Execute ${currentAgent} agent task`);

      if (hasContent) {
        await this.createHandover(
          workflowId,
          prevResult.agent,
          currentAgent,
          prevResult.stepIndex,
          handoverData
        );
        if (this.logger) {
          this.logger.logWithContext('info', 'WORKFLOW', `Created meaningful handover from ${prevResult.agent} to ${currentAgent}`);
        }
      } else {
        if (this.logger) {
          this.logger.logWithContext('debug', 'WORKFLOW', `Skipping empty handover from ${prevResult.agent} to ${currentAgent} - no meaningful content`);
        }
      }
    }
  }

  /**
   * Get all handover files for a workflow
   */
  async getWorkflowHandovers(workflowId: string): Promise<HandoverLink[]> {
    const workflowDir = join(this.workflowsBaseDir, 'active', workflowId);
    const handoverDir = join(workflowDir, 'handover');

    try {
      const files = await fs.readdir(handoverDir);
      const handoverFiles = files.filter(f => f.endsWith('.json') && !f.includes('workflow-results'));
      const handovers: HandoverLink[] = [];

      for (const file of handoverFiles) {
        const filePath = join(handoverDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const handoverLink = JSON.parse(content) as HandoverLink;
        handovers.push(handoverLink);
      }

      return handovers.sort((a, b) => a.stepIndex - b.stepIndex);
    } catch (error) {
      if (this.logger) {
        this.logger.logWithContext('warn', 'WORKFLOW', `Could not read workflow handovers: ${error}`);
      }
      return [];
    }
  }

  /**
   * Generate context summary with file references for agent prompts
   */
  generateContextWithReferences(
    workflowId: string,
    currentAgent: string,
    previousResults: PreviousResults[]
  ): string {
    if (previousResults.length === 0) {
      return `# Context for ${currentAgent}\n\nNo previous results available.`;
    }

    const workflowDir = join(this.workflowsBaseDir, 'active', workflowId);

    let context = `# Context for ${currentAgent}\n\n`;
    context += `## Previous Results Available\n\n`;

    for (const result of previousResults) {
      if (!result.available) continue;

      const relativePath = result.resultPath.replace(workflowDir + '/', '');
      context += `### ${result.agent} (Step ${result.stepIndex})\n`;
      context += `- **Result File**: \`${relativePath}/result.json\`\n`;
      context += `- **Status**: ${result.result.status}\n`;

      if (Object.keys(result.result.artifacts).length > 0) {
        context += `- **Artifacts**:\n`;
        for (const [name, path] of Object.entries(result.result.artifacts)) {
          context += `  - ${name}: \`${path}\`\n`;
        }
      }

      if (result.result.handover?.keyPoints.length > 0) {
        context += `- **Key Points**:\n`;
        for (const point of result.result.handover.keyPoints) {
          context += `  - ${point}\n`;
        }
      }

      context += '\n';
    }

    context += `## Handover Instructions\n\n`;
    context += `Check the \`handover/\` directory for specific instructions from previous agents:\n`;
    for (const result of previousResults) {
      const handoverFile = `${String(result.stepIndex).padStart(2, '0')}-${result.agent}-to-${currentAgent}.json`;
      context += `- \`handover/${handoverFile}\`\n`;
    }

    context += `\n## How to Access Results\n\n`;
    context += `1. Read the \`result.json\` files for structured data\n`;
    context += `2. Reference artifacts directly by their file paths\n`;
    context += `3. Follow handover instructions for specific next steps\n`;

    return context;
  }

  /**
   * Process handover data for better readability and remove empty fields
   */
  private processHandoverForReadability(handoverLink: HandoverLink): HandoverLink {
    const processedData: HandoverData = {
      keyPoints: handoverLink.data.keyPoints || []
    };

    // Only add optional fields if they have meaningful content
    if (handoverLink.data.forAgent && handoverLink.data.forAgent.length > 0) {
      processedData.forAgent = handoverLink.data.forAgent;
    }

    if (handoverLink.data.dependencies && handoverLink.data.dependencies.length > 0) {
      processedData.dependencies = handoverLink.data.dependencies;
    }

    if (handoverLink.data.data && Object.keys(handoverLink.data.data).length > 0) {
      processedData.data = handoverLink.data.data;
    }

    if (handoverLink.data.instructions && handoverLink.data.instructions.trim() !== '') {
      processedData.instructions = handoverLink.data.instructions;
    }

    return {
      ...handoverLink,
      data: processedData
    };
  }

  private async ensureDirectoryExists(dir: string): Promise<void> {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }
}