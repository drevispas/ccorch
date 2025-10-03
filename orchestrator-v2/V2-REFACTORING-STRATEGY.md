# ORCHESTRATOR V2 - REFACTORING STRATEGY

## 📚 Reference Documentation

> **Project Context**: This is the architectural strategy for orchestrator-v2
> - **Working Directory**: `orchestrator-v2/`
> - **Previous Version**: `../orchestrator` (v1, for reference only)
> - **Implementation Tracking**: See `V2-SESSION-TRACKER.md` for detailed status
> - **Component Mapping**: See `docs/REFERENCE_TO_PREVIOUS_VERSION.md`

## Executive Summary

This document outlines the **architectural strategy** for refactoring the orchestrator system from a monolithic, file-based architecture to a modern, event-driven, plugin-based system. The refactoring is organized into 10 focused sessions across 4 phases, with clear separation between infrastructure, integration, observability, and production readiness.

**Key Principle**: Build composable, type-safe infrastructure first, then integrate it into a working system, then optimize for production.

## Strategic Goals

### Primary Objectives
1. **Eliminate State Management Chaos** - Replace 3+ overlapping state managers with unified EventDrivenStateManager
2. **Achieve Complete Type Safety** - Full TypeScript with runtime validation (Zod)
3. **Simplify Architecture** - Plugin-based agents, single orchestrator, modern integration
4. **Enable Observability** - Real-time monitoring, distributed tracing, structured logging
5. **Production Readiness** - Self-healing, fault tolerance, comprehensive testing

### Success Criteria
- **Type Coverage**: 100% TypeScript
- **Test Coverage**: >90% with comprehensive test suites
- **Error Rate**: <1% in production
- **P99 Latency**: <500ms for API calls
- **Zero Race Conditions**: Event-driven state prevents conflicts
- **Self-Healing**: Automatic recovery from common failures

## Problems Being Solved

### 1. State Management Chaos
**Problem**: Multiple overlapping state managers causing race conditions
- 3+ different state management systems (FileStateManager, WorkflowStateManager, StateManager)
- File-based persistence causing sync issues
- No single source of truth
- Scattered state updates across codebase

**Solution**: Unified EventDrivenStateManager
- Single state manager with CQRS pattern
- Event-driven updates prevent race conditions
- Observable streams for real-time state changes
- Redis/SQLite adapters for persistent storage

### 2. Type Safety Compromises
**Problem**: Mixed JavaScript/TypeScript causing runtime errors
- Weak type contracts at API boundaries
- No runtime validation
- Implicit type coercion causing bugs
- Manual JSON parsing prone to errors

**Solution**: Full TypeScript with Runtime Validation
- 100% TypeScript conversion
- Zod schemas for all API contracts
- Request/response validation middleware
- Type-safe client SDK generation

### 3. Architecture Complexity
**Problem**: Monolithic agent definitions and dual orchestrators
- 18 hardcoded agent specification files
- Two parallel orchestrator implementations
- No dynamic agent loading
- Hook integration tightly coupled

**Solution**: Plugin-Based Architecture
- Dynamic agent plugin system
- Single unified orchestrator
- BasePlugin interface with capability discovery
- Modern hook integration with versioning

### 4. Operational Challenges
**Problem**: Limited observability and error handling
- No structured logging
- Missing timeout management
- No distributed tracing
- Manual error recovery

**Solution**: Production-Grade Operations
- Structured logging with correlation IDs
- Configurable timeouts at all levels
- Real-time monitoring via WebSocket
- Self-healing capabilities

## Refactoring Phases

### Phase 1: Core Architecture Redesign (Sessions 1-3)

**Goal**: Build foundational infrastructure with modern patterns

#### Session 1: Unified State Management

**Architecture**:
```typescript
// New unified state architecture
interface OrchestratorState {
  workflows: Map<string, WorkflowState>
  tasks: Map<string, TaskState>
  agents: Map<string, AgentState>
  events: EventEmitter
  persistence: StatePersistence
}

// Event-driven state updates
class EventDrivenStateManager {
  private state: OrchestratorState
  private eventBus: EventBus

  async updateState(event: StateEvent): Promise<void>
  async queryState(query: StateQuery): Promise<StateResult>
  async subscribeToChanges(listener: StateListener): Promise<void>
}
```

**Objectives**:
- Create unified state directory structure
- Implement EventDrivenStateManager with CQRS pattern
- Add state migration utilities from old systems
- Implement Redis/SQLite adapters for persistence
- Add comprehensive state validation schemas

**Deliverables**:
- EventDrivenStateManager with CQRS
- EventBus with RxJS Observable streams
- Persistence adapters (Redis, SQLite)
- Zod validation schemas for all state entities
- State migration utilities
- Test suites and documentation

#### Session 2: Type-Safe Integration Layer

**Architecture**:
```typescript
// Strongly typed API contracts
interface APIContract {
  request: ZodSchema
  response: ZodSchema
  params?: ZodSchema
}

// Validation middleware
class ValidationMiddleware {
  validateRequest(schema: ZodSchema): Middleware
  validateResponse(schema: ZodSchema): Middleware
  validateParams(schema: ZodSchema): Middleware
}

// Type-safe client SDK
class OrchestratorClient {
  async init(config: InitRequest): Promise<InitResponse>
  async execute(workflow: ExecuteWorkflowRequest): Promise<ExecuteWorkflowResponse>
  async getStatus(workflowId: string): Promise<WorkflowStatus>
}
```

**Objectives**:
- Convert entire server layer to TypeScript
- Create comprehensive Zod schemas for all API endpoints
- Implement request/response validation middleware
- Build OpenAPI documentation generator
- Create type-safe client SDK

**Deliverables**:
- Full TypeScript server implementation
- Zod schemas for all API contracts
- Validation middleware
- OpenAPI documentation
- Type-safe client SDK
- Complete API test suite

#### Session 3: Agent System Redesign

**Architecture**:
```typescript
// Dynamic agent loading with plugin architecture
interface AgentPlugin {
  metadata: AgentMetadata
  capabilities: Capability[]

  execute(context: AgentContext): Promise<AgentResult>
  validate(input: any): ValidationResult
  getComplexityVariant(level: ComplexityLevel): AgentDefinition
}

// Agent registry with auto-discovery
class PluginManager {
  async loadPlugin(path: string): Promise<AgentPlugin>
  async registerPlugin(plugin: AgentPlugin): Promise<void>
  async discoverPlugins(directory: string): Promise<AgentPlugin[]>
}

// Capability matching
class CapabilityRegistry {
  async matchCapabilities(required: Capability[]): Promise<AgentPlugin[]>
  async rankPlugins(plugins: AgentPlugin[], criteria: Criteria): Promise<RankedPlugin[]>
}
```

**Objectives**:
- Design plugin architecture for agents
- Implement CapabilityRegistry for discovery
- Build dynamic plugin loading mechanism
- Add versioning and compatibility system
- Create comprehensive testing framework

**Deliverables**:
- BasePlugin interface and abstract class
- PluginManager with lifecycle management
- CapabilityRegistry for matching
- PluginLoader with caching
- VersionManager for compatibility
- Test suite for plugin system

### Phase 1.5: Core Integration (Session 6.5)

**Goal**: Bridge infrastructure to working system - **CRITICAL PATH**

**Why This Phase Exists**:
Phases 1-2 built excellent infrastructure, but the system cannot execute workflows end-to-end. This bridging session connects all components into a functional system before adding observability features.

**Objectives**:
- Complete API surface (implement all 15+ endpoints)
- Create 2 MVP agent plugin implementations
- Wire task progression loop end-to-end
- Fix integration issues (WebSocket health checks)

**Deliverables**:
- All API endpoints implemented and tested
- At least 2 working agent plugins (backend-architect-simple, code-reviewer-simple)
- Complete task execution loop functional
- Integration tests passing
- End-to-end workflow execution working

**Critical Endpoints**:
- `GET /api/next-task/:workflowId` - Agents fetch pending tasks
- `POST /api/agent-result` - Agents submit results
- `GET /api/status/:workflowId` - Status monitoring
- `GET /api/workflows` - List workflows
- Debug and recovery endpoints

### Phase 2: Workflow Engine (Sessions 4-6)

**Goal**: Build reactive, observable workflow execution engine

#### Session 4: Workflow Definition System

**Architecture**:
```typescript
// Declarative workflow DSL
interface WorkflowDSL {
  name: string
  version: string
  pipeline: PipelineStage[]
  errorHandling: ErrorStrategy
  timeouts: TimeoutConfig

  validate(): ValidationResult
  compile(): ExecutableWorkflow
}

// Pipeline with built-in parallelism
type PipelineStage =
  | SequentialStage
  | ParallelStage
  | ConditionalStage
  | LoopStage
  | SubWorkflowStage
  | WaitStage
  | TransformStage

// Workflow compiler with optimizer
class WorkflowCompiler {
  compile(dsl: WorkflowDSL): ExecutableWorkflow
  optimize(workflow: ExecutableWorkflow): OptimizedWorkflow
  validate(workflow: ExecutableWorkflow): ValidationResult
}
```

**Objectives**:
- Design comprehensive workflow DSL
- Build workflow compiler with AST generation
- Implement workflow optimizer
- Add versioning and migration support
- Create visual workflow editor/viewer

**Deliverables**:
- Workflow DSL type definitions
- WorkflowCompiler implementation
- Optimization strategies
- Workflow versioning system
- Visual workflow editor
- Multi-format parser (JSON/YAML/TypeScript)

#### Session 5: Execution Engine

**Architecture**:
```typescript
// Reactive execution engine
class ReactiveExecutionEngine {
  private scheduler: TaskScheduler
  private executor: TaskExecutor
  private monitor: ExecutionMonitor

  async execute(workflow: ExecutableWorkflow): Observable<ExecutionEvent>
  async pause(executionId: string): Promise<void>
  async resume(executionId: string): Promise<void>
  async cancel(executionId: string): Promise<void>

  // Reactive streams for monitoring
  events$: Observable<ExecutionEvent>
  metrics$: Observable<ExecutionMetrics>
  errors$: Observable<ExecutionError>
}

// Priority-based task scheduling
class TaskScheduler {
  private queues: PriorityQueue<Task>[]
  private workers: WorkerPool

  async schedule(task: Task, priority: Priority): Promise<void>
  async reschedule(task: Task, delay: Duration): Promise<void>
  getQueueStatus(): QueueStatus
}

// Circuit breaker pattern
class CircuitBreaker {
  async execute<T>(fn: () => Promise<T>): Promise<T>
  getState(): CircuitState
  reset(): void
}
```

**Objectives**:
- Implement ReactiveExecutionEngine with RxJS
- Build priority-based TaskScheduler
- Add circuit breaker for fault tolerance
- Implement retry logic with strategies
- Create execution checkpointing system

**Deliverables**:
- ReactiveExecutionEngine implementation
- TaskScheduler with worker pools
- CircuitBreaker system
- RetryManager with strategies
- Execution checkpointing
- ExecutionDebugger with trace/replay

#### Session 6: Integration Layer

**Architecture**:
```typescript
// WebSocket server for real-time updates
class IntegrationWebSocketServer {
  async start(): Promise<void>
  async stop(): Promise<void>
  broadcast(message: Message): void
  sendTo(clientId: string, message: Message): void
}

// Stream workflow execution events
class StreamingBridge {
  streamWorkflowExecution(workflowId: string): Observable<WorkflowEvent>
  streamTaskExecution(taskId: string): Observable<TaskEvent>
  streamStateChanges(): Observable<StateChange>
}

// Modern hook system with versioning
class HookManager {
  async registerHook(hook: Hook): Promise<void>
  async triggerHook(event: HookEvent): Promise<HookResult>
  async migrateHooks(from: Version, to: Version): Promise<void>
}
```

**Objectives**:
- Build WebSocket server for real-time communication
- Implement StreamingBridge for observables → WebSocket
- Create HookManager with version-aware system
- Add MessageProtocolHandler for routing
- Build comprehensive integration testing framework

**Deliverables**:
- IntegrationWebSocketServer implementation
- StreamingBridge connecting execution engine
- HookManager with versioning
- MessageProtocolHandler
- IntegrationLayer orchestrator
- Real-time streaming tests

### Phase 3: Observability & Resilience (Sessions 7-8)

**Goal**: Production-grade monitoring and self-healing

**Prerequisites**: Phase 1.5 must be complete (system must execute workflows)

#### Session 7: Monitoring & Logging

**Architecture**:
```typescript
// Structured logging with correlation
class StructuredLogger {
  private correlationId: string
  private context: LogContext

  log(level: LogLevel, message: string, metadata?: any): void
  trace(span: TraceSpan): void
  metric(name: string, value: number, tags?: Tags): void
}

// Distributed tracing
class TracingSystem {
  startSpan(name: string, parent?: Span): Span
  endSpan(span: Span, result: SpanResult): void
  exportTraces(exporter: TraceExporter): void
}

// Metrics collection
class MetricsSystem {
  private collectors: MetricCollector[]

  collectMetrics(): Metrics
  exportMetrics(exporter: MetricExporter): void
  createDashboard(): DashboardConfig
}
```

**Objectives**:
- Implement structured logging with Winston
- Add OpenTelemetry integration
- Create Grafana dashboards
- Implement distributed tracing
- Add performance profiling

**Deliverables**:
- Structured logging system
- OpenTelemetry integration
- Custom Grafana dashboards
- Trace collection and export
- Performance profiling tools

#### Session 8: Error Handling & Recovery

**Architecture**:
```typescript
// Comprehensive error handling
class ErrorRecoverySystem {
  private strategies: Map<ErrorType, RecoveryStrategy>

  async handleError(error: OrchestratorError): Promise<RecoveryResult>
  async implementRecovery(strategy: RecoveryStrategy): Promise<void>
  async notifyStakeholders(error: CriticalError): Promise<void>
}

// Self-healing capabilities
class SelfHealingOrchestrator {
  private healthChecker: HealthChecker
  private autoRecovery: AutoRecovery

  async detectAnomalies(): Promise<Anomaly[]>
  async healWorkflow(workflowId: string): Promise<HealingResult>
  async rebalanceLoad(): Promise<void>
}

// Chaos engineering
class ChaosEngineer {
  injectFailure(type: FailureType): void
  simulateLoad(pattern: LoadPattern): LoadTestResult
  validateResilience(): ResilienceReport
}
```

**Objectives**:
- Implement comprehensive error recovery
- Build self-healing orchestrator
- Add chaos engineering support
- Implement automatic rollback
- Create advanced health checks

**Deliverables**:
- ErrorRecoverySystem implementation
- Self-healing capabilities
- Chaos engineering tools
- Automatic rollback system
- Health check infrastructure

### Phase 4: Testing & Production (Sessions 9-10)

**Goal**: Comprehensive testing and production deployment

#### Session 9: Testing Enhancement

**Architecture**:
```typescript
// Comprehensive testing suite
class TestFramework {
  // Unit testing
  testComponent(component: Component): TestResult

  // Integration testing
  testIntegration(scenario: IntegrationScenario): TestResult

  // End-to-end testing
  testE2E(workflow: E2EWorkflow): TestResult

  // Performance testing
  testPerformance(load: LoadProfile): PerformanceResult

  // Contract testing
  testContracts(contracts: Contract[]): ContractTestResult
}
```

**Objectives**:
- Expand unit test coverage to 100%
- Create comprehensive integration tests
- Build E2E test suite
- Add performance benchmarking
- Implement contract testing

**Deliverables**:
- Complete unit test suite
- Integration test scenarios
- E2E workflow tests
- Performance benchmarks
- Contract tests

#### Session 10: Production Migration

**Objectives**:
- Create complete API documentation
- Write migration guide from v1 to v2
- Build operator runbook
- Create interactive tutorials
- Document architecture decision records
- Execute phased cutover

**Deliverables**:
- Complete API documentation
- Migration guide with examples
- Operator runbook for production
- Interactive tutorials
- ADR documentation
- Cutover plan

## Implementation Order

### Completed
1. Session 1: Unified State Management
2. Session 2: Type-Safe Integration
3. Session 3: Agent System Infrastructure
4. Session 4: Workflow DSL
5. Session 5: Execution Engine
6. Session 6: Integration Layer

### Current Priority
**Session 6.5: Core Integration** - CRITICAL PATH
- Must complete before any Phase 3/4 work
- Unblocks all downstream features
- Demonstrates system value

### Future Work
7. Session 7: Monitoring & Logging
8. Session 8: Error Handling & Recovery
9. Session 9: Testing Enhancement
10. Session 10: Production Migration

## Architectural Principles

### 1. Event-Driven Architecture
- All state changes emit events
- Observable streams for real-time updates
- No direct state mutation
- Single source of truth

### 2. Type Safety First
- TypeScript for all code
- Zod for runtime validation
- No implicit any
- Comprehensive interface contracts

### 3. Plugin-Based Extensibility
- BasePlugin interface for all agents
- Dynamic loading and discovery
- Capability-based matching
- Version compatibility checks

### 4. Reactive Programming
- RxJS Observables throughout
- Backpressure handling
- Stream composition
- Error propagation

### 5. Production Readiness
- Circuit breakers for resilience
- Distributed tracing for debugging
- Structured logging for analysis
- Self-healing capabilities

## Risk Mitigation

### Technical Risks

**Risk**: Breaking existing workflows
- **Mitigation**: Dual-run period with old and new systems
- **Fallback**: One-click rollback to v1

**Risk**: Performance regression
- **Mitigation**: Comprehensive benchmarking before cutover
- **Success Criteria**: P99 latency < 500ms

**Risk**: Integration failures
- **Mitigation**: Feature flags for gradual rollout
- **Approach**: Canary deployments

### Organizational Risks

**Risk**: Long refactoring timeline
- **Mitigation**: Deliver value incrementally each session
- **Communication**: Regular progress updates

**Risk**: Knowledge concentration
- **Mitigation**: Comprehensive documentation, pair programming
- **Documentation**: Onboarding guides, architecture deep-dives

## Rollout Strategy

### Phase 1: Shadow Mode (Weeks 1-2)
- New system runs in parallel with v1
- Compare results but don't use them
- Identify and fix discrepancies

### Phase 2: Canary Deployment (Weeks 3-4)
- 10% traffic to new system
- Monitor metrics closely
- Gradual increase to 50%

### Phase 3: Full Migration (Week 5)
- 100% traffic to new system
- Keep old system on standby
- One-click rollback ready

### Phase 4: Cleanup (Week 6)
- Remove old system code
- Archive old state data
- Update all documentation

## Success Metrics

### Infrastructure Metrics
- **Type Coverage**: 100% TypeScript
- **Test Coverage**: >90%
- **Documentation**: Complete API docs, guides

### Operational Metrics
- **Error Rate**: <1%
- **P99 Latency**: <500ms
- **MTTR**: <5 minutes
- **Availability**: >99.9%

### Developer Experience
- **Onboarding Time**: <1 hour to first contribution
- **Build Time**: <30 seconds
- **Test Execution**: <2 minutes for full suite
- **Type Errors**: Caught at compile time

### Business Metrics
- **Deployment Frequency**: Multiple per day
- **Change Failure Rate**: <5%
- **Lead Time**: <1 day from code to production
- **User Satisfaction**: Measured via surveys

## Conclusion

This refactoring strategy transforms the orchestrator from a monolithic, file-based system to a modern, event-driven, plugin-based architecture. The phased approach ensures:

1. **Solid Foundations** - Phase 1 builds core infrastructure
2. **Working System** - Phase 1.5 bridges to execution
3. **Production Ready** - Phase 3 adds observability
4. **Sustainable** - Phase 4 ensures long-term maintainability

**Key Success Factor**: Completing Session 6.5 (Core Integration) is critical - it bridges infrastructure to working system and unlocks all future value.

For detailed implementation status, progress tracking, and session notes, see `V2-SESSION-TRACKER.md`.