import { EventEmitter } from 'events';
import { Observable, Subject, BehaviorSubject, fromEvent } from 'rxjs';
import { filter, map, take, takeUntil } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import {
  DebugSession,
  Breakpoint,
  BreakpointLocation,
  BreakpointAction,
  StepMode,
  ExecutionTrace,
  TraceType,
  DebugSnapshot,
  CallFrame,
  DebugPosition,
  ExecutionContext,
  TaskExecution,
  TaskId,
  StageId,
  TaskExecutionStatus,
} from './types';

export interface ExecutionDebuggerOptions {
  maxTraceSize?: number;
  maxSnapshotHistory?: number;
  enableTimeTravelDebugging?: boolean;
  enablePerformanceProfiling?: boolean;
  traceBufferSize?: number;
  snapshotInterval?: number;
}

export class ExecutionDebugger extends EventEmitter {
  private options: Required<ExecutionDebuggerOptions>;
  private activeSessions: Map<string, DebugSession> = new Map();
  private globalBreakpoints: Map<string, Breakpoint> = new Map();
  private executionTraces: Map<string, ExecutionTrace[]> = new Map();
  private snapshots: Map<string, DebugSnapshot[]> = new Map();
  private callStacks: Map<string, CallFrame[]> = new Map();
  private watchedVariables: Map<string, Set<string>> = new Map();
  private pausedExecutions: Set<string> = new Set();
  private stepRequests: Map<string, { mode: StepMode; resolve: () => void }> = new Map();

  constructor(options: ExecutionDebuggerOptions = {}) {
    super();

    this.options = {
      maxTraceSize: options.maxTraceSize ?? 10000,
      maxSnapshotHistory: options.maxSnapshotHistory ?? 100,
      enableTimeTravelDebugging: options.enableTimeTravelDebugging ?? true,
      enablePerformanceProfiling: options.enablePerformanceProfiling ?? true,
      traceBufferSize: options.traceBufferSize ?? 1000,
      snapshotInterval: options.snapshotInterval ?? 5000,
    };
  }

  public async initialize(): Promise<void> {
    // ExecutionDebugger is initialized in constructor
    // This method is provided for interface compatibility
  }

  public getEvents(): Observable<any> {
    // Return observable of debug events
    return fromEvent(this, 'debug-event');
  }

  public createDebugSession(executionId: string): DebugSession {
    const sessionId = uuidv4();

    const session: DebugSession = {
      sessionId,
      executionId,
      startedAt: new Date(),
      breakpoints: [],
      traces: [],
      snapshots: [],
      watchedVariables: new Set(),
      stepMode: StepMode.NONE,
    };

    this.activeSessions.set(sessionId, session);
    this.executionTraces.set(executionId, []);
    this.snapshots.set(executionId, []);
    this.callStacks.set(executionId, []);
    this.watchedVariables.set(executionId, new Set());

    this.emit('debug:session-created', session);
    return session;
  }

  public endDebugSession(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.endedAt = new Date();
    this.activeSessions.delete(sessionId);

    // Clean up resources
    this.executionTraces.delete(session.executionId);
    this.snapshots.delete(session.executionId);
    this.callStacks.delete(session.executionId);
    this.watchedVariables.delete(session.executionId);
    this.pausedExecutions.delete(session.executionId);

    this.emit('debug:session-ended', session);
    return true;
  }

  public addBreakpoint(
    sessionId: string,
    location: BreakpointLocation,
    condition?: string,
    actions?: BreakpointAction[]
  ): Breakpoint {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Debug session ${sessionId} not found`);
    }

    const breakpoint: Breakpoint = {
      id: uuidv4(),
      location,
      condition,
      hitCount: 0,
      enabled: true,
      actions,
    };

    session.breakpoints.push(breakpoint);
    this.globalBreakpoints.set(breakpoint.id, breakpoint);

    this.emit('debug:breakpoint-added', { sessionId, breakpoint });
    return breakpoint;
  }

  public removeBreakpoint(sessionId: string, breakpointId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return false;
    }

    const index = session.breakpoints.findIndex(bp => bp.id === breakpointId);
    if (index === -1) {
      return false;
    }

    session.breakpoints.splice(index, 1);
    this.globalBreakpoints.delete(breakpointId);

    this.emit('debug:breakpoint-removed', { sessionId, breakpointId });
    return true;
  }

  public enableBreakpoint(breakpointId: string): boolean {
    const breakpoint = this.globalBreakpoints.get(breakpointId);
    if (!breakpoint) {
      return false;
    }

    breakpoint.enabled = true;
    this.emit('debug:breakpoint-enabled', breakpointId);
    return true;
  }

  public disableBreakpoint(breakpointId: string): boolean {
    const breakpoint = this.globalBreakpoints.get(breakpointId);
    if (!breakpoint) {
      return false;
    }

    breakpoint.enabled = false;
    this.emit('debug:breakpoint-disabled', breakpointId);
    return true;
  }

  public addWatchVariable(sessionId: string, variableName: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.watchedVariables.add(variableName);
    const watchedVars = this.watchedVariables.get(session.executionId);
    if (watchedVars) {
      watchedVars.add(variableName);
    }

    this.emit('debug:watch-added', { sessionId, variableName });
    return true;
  }

  public removeWatchVariable(sessionId: string, variableName: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.watchedVariables.delete(variableName);
    const watchedVars = this.watchedVariables.get(session.executionId);
    if (watchedVars) {
      watchedVars.delete(variableName);
    }

    this.emit('debug:watch-removed', { sessionId, variableName });
    return true;
  }

  public async checkBreakpoints(
    executionId: string,
    position: DebugPosition,
    context?: any
  ): Promise<boolean> {
    const session = this.getSessionByExecutionId(executionId);
    if (!session) {
      return false;
    }

    let shouldBreak = false;

    for (const breakpoint of session.breakpoints) {
      if (!breakpoint.enabled) continue;

      const matches = this.matchesBreakpoint(breakpoint, position, context);
      if (matches) {
        breakpoint.hitCount++;

        // Check condition if specified
        if (breakpoint.condition) {
          const conditionMet = await this.evaluateCondition(breakpoint.condition, context);
          if (!conditionMet) continue;
        }

        // Execute actions if specified
        if (breakpoint.actions) {
          await this.executeBreakpointActions(breakpoint.actions, context);
        }

        shouldBreak = true;
        this.emit('debug:breakpoint-hit', {
          sessionId: session.sessionId,
          breakpoint,
          position,
          context,
        });
      }
    }

    if (shouldBreak) {
      await this.pauseExecution(executionId, position);
    }

    return shouldBreak;
  }

  private matchesBreakpoint(
    breakpoint: Breakpoint,
    position: DebugPosition,
    context?: any
  ): boolean {
    const { location } = breakpoint;

    switch (location.type) {
      case 'task':
        return position.taskId === location.taskId;

      case 'stage':
        return position.stageId === location.stageId;

      case 'line':
        return position.line === location.line;

      case 'error':
        return context?.error && (!location.errorType || context.error.type === location.errorType);

      case 'condition':
        // Condition breakpoints are evaluated separately
        return true;

      default:
        return false;
    }
  }

  private async evaluateCondition(condition: string, context?: any): Promise<boolean> {
    try {
      // Simple condition evaluation - in production, use a safe expression evaluator
      const func = new Function('context', `return ${condition}`);
      return func(context);
    } catch {
      return false;
    }
  }

  private async executeBreakpointActions(
    actions: BreakpointAction[],
    context?: any
  ): Promise<void> {
    for (const action of actions) {
      switch (action.type) {
        case 'log':
          console.log('Breakpoint action:', action.payload);
          break;

        case 'snapshot':
          await this.takeSnapshot(context.executionId, undefined, action.payload);
          break;

        case 'evaluate':
          try {
            const result = await this.evaluateExpression(action.payload, context);
            console.log('Evaluated:', action.payload, '=', result);
          } catch (error) {
            console.error('Evaluation error:', error);
          }
          break;

        case 'modify':
          // Implement variable modification
          break;
      }
    }
  }

  private async evaluateExpression(expression: string, context?: any): Promise<any> {
    try {
      const func = new Function('context', `return ${expression}`);
      return func(context);
    } catch (error) {
      throw new Error(`Failed to evaluate expression: ${expression}`);
    }
  }

  public async pauseExecution(executionId: string, position?: DebugPosition): Promise<void> {
    this.pausedExecutions.add(executionId);

    const session = this.getSessionByExecutionId(executionId);
    if (session) {
      session.currentPosition = position;
      session.stepMode = StepMode.NONE;
    }

    this.emit('debug:execution-paused', { executionId, position });

    // Wait for step or continue command
    await this.waitForDebugCommand(executionId);
  }

  private async waitForDebugCommand(executionId: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const stepRequest = this.stepRequests.get(executionId);
      if (stepRequest) {
        stepRequest.resolve = resolve;
      } else {
        this.stepRequests.set(executionId, { mode: StepMode.NONE, resolve });
      }
    });
  }

  public continueExecution(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return false;
    }

    this.pausedExecutions.delete(session.executionId);
    session.stepMode = StepMode.CONTINUE;

    const stepRequest = this.stepRequests.get(session.executionId);
    if (stepRequest) {
      stepRequest.mode = StepMode.CONTINUE;
      stepRequest.resolve();
      this.stepRequests.delete(session.executionId);
    }

    this.emit('debug:execution-continued', { sessionId });
    return true;
  }

  public stepInto(sessionId: string): boolean {
    return this.setStepMode(sessionId, StepMode.INTO);
  }

  public stepOver(sessionId: string): boolean {
    return this.setStepMode(sessionId, StepMode.OVER);
  }

  public stepOut(sessionId: string): boolean {
    return this.setStepMode(sessionId, StepMode.OUT);
  }

  private setStepMode(sessionId: string, mode: StepMode): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return false;
    }

    this.pausedExecutions.delete(session.executionId);
    session.stepMode = mode;

    const stepRequest = this.stepRequests.get(session.executionId);
    if (stepRequest) {
      stepRequest.mode = mode;
      stepRequest.resolve();
      this.stepRequests.delete(session.executionId);
    }

    this.emit('debug:step-mode-set', { sessionId, mode });
    return true;
  }

  public addTrace(
    executionId: string,
    type: TraceType,
    location: string,
    data: any,
    stackDepth: number = 0,
    variables?: Record<string, any>
  ): void {
    const traces = this.executionTraces.get(executionId);
    if (!traces) return;

    const trace: ExecutionTrace = {
      timestamp: new Date(),
      type,
      location,
      data,
      stackDepth,
      variables,
    };

    traces.push(trace);

    // Maintain trace buffer size
    if (traces.length > this.options.traceBufferSize) {
      traces.shift();
    }

    // Check for watched variable changes
    if (variables && type === TraceType.VARIABLE_CHANGE) {
      this.checkWatchedVariables(executionId, variables);
    }

    this.emit('debug:trace-added', { executionId, trace });
  }

  private checkWatchedVariables(executionId: string, variables: Record<string, any>): void {
    const watchedVars = this.watchedVariables.get(executionId);
    if (!watchedVars) return;

    for (const [varName, value] of Object.entries(variables)) {
      if (watchedVars.has(varName)) {
        this.emit('debug:watch-triggered', {
          executionId,
          variableName: varName,
          value,
          timestamp: new Date(),
        });
      }
    }
  }

  public async takeSnapshot(
    executionId: string,
    breakpointId?: string,
    metadata?: any
  ): Promise<DebugSnapshot> {
    const snapshots = this.snapshots.get(executionId);
    if (!snapshots) {
      throw new Error(`No debug session for execution ${executionId}`);
    }

    // Get current execution state (would need to be provided by execution engine)
    const executionState = await this.getCurrentExecutionState(executionId);
    const taskStates = await this.getCurrentTaskStates(executionId);
    const variables = await this.getCurrentVariables(executionId);
    const callStack = this.callStacks.get(executionId) || [];

    const snapshot: DebugSnapshot = {
      id: uuidv4(),
      timestamp: new Date(),
      executionState,
      taskStates,
      variables,
      callStack: [...callStack],
      breakpointId,
    };

    snapshots.push(snapshot);

    // Maintain snapshot history size
    if (snapshots.length > this.options.maxSnapshotHistory) {
      snapshots.shift();
    }

    this.emit('debug:snapshot-taken', { executionId, snapshot, metadata });
    return snapshot;
  }

  private async getCurrentExecutionState(executionId: string): Promise<ExecutionContext> {
    // Return the current execution context from tracking
    const session = this.activeSessions.get(executionId);
    if (!session) {
      return {
        executionId,
        workflowId: '',
        status: 'running' as any,
        variables: new Map(),
        results: new Map(),
        errors: [],
        checkpoints: [],
        startedAt: new Date(),
        metadata: {},
      } as unknown as ExecutionContext;
    }
    // Return a mock context based on session
    return {
      executionId,
      workflowId: session.executionId,
      status: 'running' as any,
      variables: new Map(),
      results: new Map(),
      errors: [],
      checkpoints: [],
      startedAt: session.startedAt,
      metadata: {},
    } as unknown as ExecutionContext;
  }

  private async getCurrentTaskStates(executionId: string): Promise<Map<TaskId, TaskExecution>> {
    // Return empty map as we don't have detailed task tracking in sessions
    return new Map<TaskId, TaskExecution>();
  }

  private async getCurrentVariables(executionId: string): Promise<Record<string, any>> {
    // Return empty object as we don't have variable tracking in sessions
    return {};
  }

  public pushCallFrame(executionId: string, frame: CallFrame): void {
    const callStack = this.callStacks.get(executionId);
    if (callStack) {
      callStack.push(frame);
      this.emit('debug:call-frame-pushed', { executionId, frame });
    }
  }

  public popCallFrame(executionId: string): CallFrame | undefined {
    const callStack = this.callStacks.get(executionId);
    if (callStack && callStack.length > 0) {
      const frame = callStack.pop();
      this.emit('debug:call-frame-popped', { executionId, frame });
      return frame;
    }
    return undefined;
  }

  public getCallStack(executionId: string): CallFrame[] {
    return this.callStacks.get(executionId) || [];
  }

  public getTraces(executionId: string, filter?: {
    type?: TraceType;
    fromTime?: Date;
    toTime?: Date;
    limit?: number;
  }): ExecutionTrace[] {
    const traces = this.executionTraces.get(executionId) || [];

    let filtered = traces;

    if (filter) {
      if (filter.type) {
        filtered = filtered.filter(t => t.type === filter.type);
      }

      if (filter.fromTime) {
        filtered = filtered.filter(t => t.timestamp >= filter.fromTime!);
      }

      if (filter.toTime) {
        filtered = filtered.filter(t => t.timestamp <= filter.toTime!);
      }

      if (filter.limit) {
        filtered = filtered.slice(-filter.limit);
      }
    }

    return filtered;
  }

  public getSnapshots(executionId: string, limit?: number): DebugSnapshot[] {
    const snapshots = this.snapshots.get(executionId) || [];
    return limit ? snapshots.slice(-limit) : snapshots;
  }

  public restoreFromSnapshot(snapshotId: string): Promise<void> {
    if (!this.options.enableTimeTravelDebugging) {
      throw new Error('Time travel debugging is not enabled');
    }

    // Find snapshot across all executions
    for (const [executionId, snapshots] of this.snapshots) {
      const snapshot = snapshots.find(s => s.id === snapshotId);
      if (snapshot) {
        return this.performTimeTravel(executionId, snapshot);
      }
    }

    throw new Error(`Snapshot ${snapshotId} not found`);
  }

  private async performTimeTravel(executionId: string, snapshot: DebugSnapshot): Promise<void> {
    // This would restore the execution state to the snapshot
    this.emit('debug:time-travel', { executionId, snapshot });

    // Update current position
    const session = this.getSessionByExecutionId(executionId);
    if (session) {
      session.currentPosition = {
        taskId: undefined, // Would be extracted from snapshot
        stageId: undefined, // Would be extracted from snapshot
      };
    }
  }

  private getSessionByExecutionId(executionId: string): DebugSession | undefined {
    for (const session of this.activeSessions.values()) {
      if (session.executionId === executionId) {
        return session;
      }
    }
    return undefined;
  }

  public isExecutionPaused(executionId: string): boolean {
    return this.pausedExecutions.has(executionId);
  }

  public getActiveDebugSessions(): DebugSession[] {
    return Array.from(this.activeSessions.values());
  }

  public getDebugSession(sessionId: string): DebugSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  public generateExecutionReport(executionId: string): {
    summary: any;
    traces: ExecutionTrace[];
    snapshots: DebugSnapshot[];
    performance: any;
  } {
    const traces = this.getTraces(executionId);
    const snapshots = this.getSnapshots(executionId);

    const summary = {
      executionId,
      totalTraces: traces.length,
      totalSnapshots: snapshots.length,
      duration: this.calculateExecutionDuration(traces),
      breakpointHits: traces.filter(t => t.type === TraceType.CUSTOM && t.data.type === 'breakpoint').length,
    };

    const performance = this.analyzePerformance(traces);

    return {
      summary,
      traces,
      snapshots,
      performance,
    };
  }

  private calculateExecutionDuration(traces: ExecutionTrace[]): number {
    if (traces.length === 0) return 0;

    const start = traces[0].timestamp.getTime();
    const end = traces[traces.length - 1].timestamp.getTime();
    return end - start;
  }

  private analyzePerformance(traces: ExecutionTrace[]): any {
    if (!this.options.enablePerformanceProfiling) {
      return null;
    }

    const taskStartTimes = new Map<string, number>();
    const taskDurations = new Map<string, number>();

    for (const trace of traces) {
      if (trace.type === TraceType.TASK_START) {
        taskStartTimes.set(trace.location, trace.timestamp.getTime());
      } else if (trace.type === TraceType.TASK_END) {
        const startTime = taskStartTimes.get(trace.location);
        if (startTime) {
          const duration = trace.timestamp.getTime() - startTime;
          taskDurations.set(trace.location, duration);
        }
      }
    }

    const durations = Array.from(taskDurations.values());
    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const maxDuration = Math.max(...durations);
    const minDuration = Math.min(...durations);

    return {
      taskCount: taskDurations.size,
      averageDuration: avgDuration,
      maxDuration,
      minDuration,
      taskDurations: Object.fromEntries(taskDurations),
    };
  }

  public async shutdown(): Promise<void> {
    // End all active sessions
    const sessionIds = Array.from(this.activeSessions.keys());
    for (const sessionId of sessionIds) {
      this.endDebugSession(sessionId);
    }

    this.emit('debug:shutdown');
  }
}

export default ExecutionDebugger;