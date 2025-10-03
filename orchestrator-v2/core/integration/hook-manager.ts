import { EventEmitter } from 'events';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { map, filter, timeout, catchError } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import semver from 'semver';

import {
  HookDefinition,
  HookImplementation,
  HookExecutionContext,
  HookMiddleware,
  HookRegistration,
  HookRegistrationSchema,
  WebSocketConnection,
  IntegrationError,
  IntegrationErrorCode,
} from './types';

export interface HookManagerConfig {
  maxConcurrentExecutions: number;
  executionTimeout: number;
  registrySize: number;
  versioningEnabled: boolean;
  enableSandbox: boolean;
  allowedPackages: string[];
  migrationEnabled: boolean;
}

export interface HookRegistry {
  [hookName: string]: {
    [version: string]: HookImplementation;
  };
}

export interface HookCompatibilityMatrix {
  [hookName: string]: {
    supportedVersions: string[];
    latestVersion: string;
    deprecatedVersions: string[];
    migrationPaths: {
      from: string;
      to: string;
      migrator: (oldInput: any) => any;
    }[];
  };
}

export interface HookExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  executionTime: number;
  hookVersion: string;
  metadata: {
    executionId: string;
    hookName: string;
    timestamp: Date;
    context: HookExecutionContext;
  };
}

export class HookManager extends EventEmitter {
  private registry: HookRegistry = {};
  private compatibilityMatrix: HookCompatibilityMatrix = {};
  private middleware: Map<string, HookMiddleware[]> = new Map();
  private executionQueue: Map<string, Promise<HookExecutionResult>> = new Map();
  private config: HookManagerConfig;

  // Observables for hook events (with subject suffix to avoid conflicts with getters)
  private hookRegisteredSubject = new Subject<{ name: string; version: string; implementation: HookImplementation }>();
  private hookExecutedSubject = new Subject<HookExecutionResult>();
  private hookErrorSubject = new Subject<{ hookName: string; error: IntegrationError }>();

  // Metrics
  private metrics = {
    totalHooks: 0,
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    averageExecutionTime: 0,
    concurrentExecutions: 0,
  };

  constructor(config: HookManagerConfig) {
    super();
    this.config = config;
    this.setupObservables();
    this.registerBuiltinHooks();
  }

  private setupObservables(): void {
    // Monitor hook registrations
    this.hookRegistered$.subscribe(({ name, version }) => {
      this.metrics.totalHooks++;
      this.emit('hook_registered', { name, version });
    });

    // Monitor hook executions
    this.hookExecuted$.subscribe((result) => {
      this.metrics.totalExecutions++;
      if (result.success) {
        this.metrics.successfulExecutions++;
      } else {
        this.metrics.failedExecutions++;
      }

      // Update average execution time
      const prevTotal = this.metrics.totalExecutions - 1;
      if (prevTotal === 0) {
        this.metrics.averageExecutionTime = result.executionTime;
      } else {
        this.metrics.averageExecutionTime =
          (this.metrics.averageExecutionTime * prevTotal + result.executionTime) /
          this.metrics.totalExecutions;
      }

      this.emit('hook_executed', result);
    });

    // Monitor errors
    this.hookErrorSubject.subscribe(({ hookName, error }) => {
      this.emit('hook_error', { hookName, error });
    });
  }

  private registerBuiltinHooks(): void {
    // Register built-in hook implementations
    this.registerBuiltinHook('user-prompt-submit', '1.0.0', this.userPromptSubmitV1);
    this.registerBuiltinHook('user-prompt-submit', '2.0.0', this.userPromptSubmitV2);
    this.registerBuiltinHook('task-completed', '1.0.0', this.taskCompletedV1);
    this.registerBuiltinHook('workflow-status-changed', '1.0.0', this.workflowStatusChangedV1);

    // Setup compatibility matrix
    this.setupCompatibilityMatrix();
  }

  private registerBuiltinHook(name: string, version: string, handler: Function): void {
    const definition: HookDefinition = {
      name,
      version,
      description: `Built-in ${name} hook`,
      inputSchema: this.getBuiltinHookInputSchema(name),
      outputSchema: this.getBuiltinHookOutputSchema(name),
      metadata: {
        author: 'orchestrator-v2',
        tags: ['builtin', 'core'],
        documentation: `Built-in implementation of ${name} hook`,
      },
    };

    const implementation: HookImplementation = {
      definition,
      handler: handler.bind(this),
    };

    this.registerHook(implementation);
  }

  private getBuiltinHookInputSchema(hookName: string): any {
    // Return appropriate Zod schemas for built-in hooks
    // This would be implemented based on actual hook requirements
    return require('zod').object({
      prompt: require('zod').string(),
      context: require('zod').any().optional(),
    });
  }

  private getBuiltinHookOutputSchema(hookName: string): any {
    return require('zod').object({
      success: require('zod').boolean(),
      result: require('zod').any().optional(),
      error: require('zod').string().optional(),
    });
  }

  private setupCompatibilityMatrix(): void {
    this.compatibilityMatrix = {
      'user-prompt-submit': {
        supportedVersions: ['1.0.0', '2.0.0'],
        latestVersion: '2.0.0',
        deprecatedVersions: [],
        migrationPaths: [
          {
            from: '1.0.0',
            to: '2.0.0',
            migrator: (oldInput: any) => ({
              ...oldInput,
              version: '2.0.0',
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      },
      'task-completed': {
        supportedVersions: ['1.0.0'],
        latestVersion: '1.0.0',
        deprecatedVersions: [],
        migrationPaths: [],
      },
      'workflow-status-changed': {
        supportedVersions: ['1.0.0'],
        latestVersion: '1.0.0',
        deprecatedVersions: [],
        migrationPaths: [],
      },
    };
  }

  // Built-in hook implementations

  private async userPromptSubmitV1(input: any, context: HookExecutionContext): Promise<any> {
    // Legacy user-prompt-submit implementation
    return {
      action: 'task_created',
      taskId: uuidv4(),
      prompt: input.prompt,
      timestamp: new Date().toISOString(),
    };
  }

  private async userPromptSubmitV2(input: any, context: HookExecutionContext): Promise<any> {
    // Enhanced user-prompt-submit implementation with streaming support
    return {
      action: 'task_created',
      taskId: uuidv4(),
      prompt: input.prompt,
      timestamp: new Date().toISOString(),
      streamingEnabled: true,
      version: '2.0.0',
      capabilities: ['real_time_updates', 'bidirectional_control'],
    };
  }

  private async taskCompletedV1(input: any, context: HookExecutionContext): Promise<any> {
    return {
      acknowledged: true,
      taskId: input.taskId,
      completedAt: new Date().toISOString(),
    };
  }

  private async workflowStatusChangedV1(input: any, context: HookExecutionContext): Promise<any> {
    return {
      acknowledged: true,
      workflowId: input.workflowId,
      status: input.status,
      timestamp: new Date().toISOString(),
    };
  }

  // Public API

  public registerHook(implementation: HookImplementation): void {
    const { name, version } = implementation.definition;

    // Validate implementation
    this.validateHookImplementation(implementation);

    // Initialize hook registry for this name if needed
    if (!this.registry[name]) {
      this.registry[name] = {};
    }

    // Store implementation
    this.registry[name][version] = implementation;

    // Update compatibility matrix
    this.updateCompatibilityMatrix(name, version);

    this.hookRegisteredSubject.next({ name, version, implementation });
  }

  public async registerHookFromRequest(
    registration: HookRegistration,
    connection: WebSocketConnection
  ): Promise<void> {
    try {
      // Validate registration request
      const validatedRegistration = HookRegistrationSchema.parse(registration);

      // Check registry size limits
      if (Object.keys(this.registry).length >= this.config.registrySize) {
        throw new Error('Hook registry is full');
      }

      // Create hook implementation from registration
      const implementation = await this.createImplementationFromRegistration(
        validatedRegistration,
        connection
      );

      // Register the hook
      this.registerHook(implementation);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const integrationError: IntegrationError = {
        name: 'IntegrationError',
        message: errorMessage.includes('not yet implemented') ? errorMessage : `Hook registration failed: ${errorMessage}`,
        code: IntegrationErrorCode.HOOK_EXECUTION_FAILED,
        timestamp: new Date(),
      };
      this.hookErrorSubject.next({ hookName: registration.name, error: integrationError });
      throw new Error(errorMessage);
    }
  }

  public async executeHook(
    hookName: string,
    input: any,
    context: HookExecutionContext,
    preferredVersion?: string
  ): Promise<HookExecutionResult> {
    const startTime = Date.now();
    const executionId = uuidv4();

    try {
      // Check concurrent execution limits
      if (this.metrics.concurrentExecutions >= this.config.maxConcurrentExecutions) {
        throw new Error('Maximum concurrent executions exceeded');
      }

      // Increment concurrent executions count immediately
      this.metrics.concurrentExecutions++;

      // Find appropriate hook version
      const implementation = this.findBestHookVersion(hookName, preferredVersion);
      if (!implementation) {
        throw new Error(`Hook ${hookName} not found`);
      }

      // Validate input
      await this.validateHookInput(implementation, input);

      // Apply input migration if needed
      const migratedInput = await this.migrateInputIfNeeded(
        hookName,
        implementation.definition.version,
        input,
        preferredVersion
      );

      // Execute with timeout
      const executionPromise = this.executeHookWithMiddleware(
        implementation,
        migratedInput,
        { ...context, executionId }
      );

      this.executionQueue.set(executionId, executionPromise);

      const result = await Promise.race([
        executionPromise,
        this.createTimeoutPromise(this.config.executionTimeout),
      ]);

      const executionTime = Math.max(1, Date.now() - startTime);
      const hookResult: HookExecutionResult = {
        success: true,
        result,
        executionTime,
        hookVersion: implementation.definition.version,
        metadata: {
          executionId,
          hookName,
          timestamp: new Date(),
          context,
        },
      };

      this.hookExecutedSubject.next(hookResult);
      return hookResult;

    } catch (error) {
      const executionTime = Math.max(1, Date.now() - startTime);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const hookResult: HookExecutionResult = {
        success: false,
        error: errorMessage,
        executionTime,
        hookVersion: preferredVersion || 'unknown',
        metadata: {
          executionId,
          hookName,
          timestamp: new Date(),
          context,
        },
      };

      // Emit error event
      const integrationError: IntegrationError = {
        name: 'HookExecutionError',
        message: errorMessage,
        code: IntegrationErrorCode.HOOK_EXECUTION_FAILED,
        timestamp: new Date(),
      };
      this.hookErrorSubject.next({ hookName, error: integrationError });

      this.hookExecutedSubject.next(hookResult);
      return hookResult;

    } finally {
      this.executionQueue.delete(executionId);
      this.metrics.concurrentExecutions--;
    }
  }

  private validateHookImplementation(implementation: HookImplementation): void {
    const { definition } = implementation;

    if (!definition.name || !definition.version) {
      throw new Error('Hook definition must have name and version');
    }

    if (!semver.valid(definition.version)) {
      throw new Error('Hook version must be valid semver');
    }

    if (typeof implementation.handler !== 'function') {
      throw new Error('Hook implementation must have a handler function');
    }
  }

  private async createImplementationFromRegistration(
    registration: HookRegistration,
    connection: WebSocketConnection
  ): Promise<HookImplementation> {
    // This would create a sandboxed execution environment for user-defined hooks
    // For now, we'll throw an error for security reasons
    throw new Error('User-defined hook registration not yet implemented for security reasons');
  }

  private findBestHookVersion(hookName: string, preferredVersion?: string): HookImplementation | null {
    const hookVersions = this.registry[hookName];
    if (!hookVersions) return null;

    // If preferred version specified and exists, use it
    if (preferredVersion && hookVersions[preferredVersion]) {
      return hookVersions[preferredVersion];
    }

    // Otherwise, find the latest compatible version
    const compatibility = this.compatibilityMatrix[hookName];
    if (compatibility) {
      const latestVersion = compatibility.latestVersion;
      if (hookVersions[latestVersion]) {
        return hookVersions[latestVersion];
      }
    }

    // Fallback to any available version (highest semver)
    const availableVersions = Object.keys(hookVersions);
    const sortedVersions = availableVersions.sort((a, b) => semver.compare(b, a));

    return sortedVersions.length > 0 ? hookVersions[sortedVersions[0]] : null;
  }

  private async validateHookInput(implementation: HookImplementation, input: any): Promise<void> {
    try {
      await implementation.definition.inputSchema.parseAsync(input);
    } catch (error) {
      throw new Error(`Hook input validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async migrateInputIfNeeded(
    hookName: string,
    targetVersion: string,
    input: any,
    sourceVersion?: string
  ): Promise<any> {
    if (!sourceVersion || !this.config.migrationEnabled) {
      return input;
    }

    const compatibility = this.compatibilityMatrix[hookName];
    if (!compatibility) return input;

    // Find migration path
    const migrationPath = compatibility.migrationPaths.find(
      path => path.from === sourceVersion && path.to === targetVersion
    );

    if (migrationPath) {
      return migrationPath.migrator(input);
    }

    return input;
  }

  private async executeHookWithMiddleware(
    implementation: HookImplementation,
    input: any,
    context: HookExecutionContext
  ): Promise<any> {
    const middleware = implementation.middleware || [];
    const hookSpecificMiddleware = this.middleware.get(context.hookName) || [];
    const allMiddleware = [
      ...(this.middleware.get('global') || []),
      ...hookSpecificMiddleware,
      ...middleware,
    ];

    let currentInput = input;

    // Execute middleware chain
    for (const mw of allMiddleware) {
      currentInput = await mw.execute(currentInput, context, async () => {
        return currentInput;
      });
    }

    // Execute main handler
    return await implementation.handler(currentInput, context);
  }

  private createTimeoutPromise(timeout: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Hook execution timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  private updateCompatibilityMatrix(hookName: string, version: string): void {
    if (!this.compatibilityMatrix[hookName]) {
      this.compatibilityMatrix[hookName] = {
        supportedVersions: [],
        latestVersion: version,
        deprecatedVersions: [],
        migrationPaths: [],
      };
    }

    const compatibility = this.compatibilityMatrix[hookName];

    if (!compatibility.supportedVersions.includes(version)) {
      compatibility.supportedVersions.push(version);
    }

    // Update latest version if this one is newer
    if (semver.gt(version, compatibility.latestVersion)) {
      compatibility.latestVersion = version;
    }
  }

  // Middleware management

  public addGlobalMiddleware(middleware: HookMiddleware): void {
    const globalMiddleware = this.middleware.get('global') || [];
    globalMiddleware.push(middleware);
    this.middleware.set('global', globalMiddleware);
  }

  public addHookMiddleware(hookName: string, middleware: HookMiddleware): void {
    const hookMiddleware = this.middleware.get(hookName) || [];
    hookMiddleware.push(middleware);
    this.middleware.set(hookName, hookMiddleware);
  }

  // Query methods

  public getRegisteredHooks(): string[] {
    return Object.keys(this.registry);
  }

  public getHookVersions(hookName: string): string[] {
    const hookVersions = this.registry[hookName];
    return hookVersions ? Object.keys(hookVersions) : [];
  }

  public getCompatibilityMatrix(): HookCompatibilityMatrix {
    return { ...this.compatibilityMatrix };
  }

  public isHookRegistered(hookName: string, version?: string): boolean {
    const hookVersions = this.registry[hookName];
    if (!hookVersions) return false;

    if (version) {
      return !!hookVersions[version];
    }

    return Object.keys(hookVersions).length > 0;
  }

  public getMetrics() {
    return { ...this.metrics };
  }

  // Observable getters

  public get hookRegistered$(): Observable<{ name: string; version: string; implementation: HookImplementation }> {
    return this.hookRegisteredSubject.asObservable();
  }

  public get hookExecuted$(): Observable<HookExecutionResult> {
    return this.hookExecutedSubject.asObservable();
  }

  public get hookError$(): Observable<{ hookName: string; error: IntegrationError }> {
    return this.hookErrorSubject.asObservable();
  }
}