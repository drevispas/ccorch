import { AgentResult } from './types/common.types';

export interface HandoverData extends AgentResult {
  taskId?: string;
  agentName?: string;
}

export interface HandoverContext {
  taskId: string;
  fromAgent?: string;
  toAgent: string;
  data: HandoverData | AgentResult;
}

export class HandoverChain {
  private chain: HandoverContext[] = [];

  addHandover(context: HandoverContext): void {
    this.chain.push(context);
  }

  getChain(): HandoverContext[] {
    return [...this.chain];
  }

  getLastHandover(): HandoverContext | undefined {
    return this.chain[this.chain.length - 1];
  }

  clearChain(): void {
    this.chain = [];
  }

  getHandoversForTask(taskId: string): HandoverContext[] {
    return this.chain.filter(h => h.taskId === taskId);
  }

  createHandoverFromResults(results: (HandoverData | AgentResult)[]): HandoverContext | null {
    if (!results || results.length === 0) {
      return null;
    }

    const lastResult = results[results.length - 1];
    const handoverData = lastResult as HandoverData;
    return {
      taskId: handoverData.taskId || 'unknown',
      fromAgent: handoverData.agentName,
      toAgent: 'next',
      data: lastResult
    };
  }
}