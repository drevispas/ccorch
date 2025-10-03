// Centralized enums for the orchestrator

// =====================
// Complexity Levels
// =====================

export enum ComplexityLevel {
  SIMPLE = 'simple',
  MODERATE = 'moderate',
  COMPLEX = 'complex',
}

// =====================
// Response & Status Enums
// =====================

export enum ResponseStatus {
  AWAITING_CLAUDE_EXECUTION = 'awaiting_claude_execution',
  RECEIVED = 'received',
  HEALTHY = 'healthy',
  INITIALIZED = 'initialized',
  STARTING = 'starting',
  STARTED = 'started',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SUCCESS = 'success',
  CONFIRMED = 'confirmed',
  UNSUBSCRIBED = 'unsubscribed',
  REGISTERED = 'registered',
  ACKNOWLEDGED = 'acknowledged',
  PAUSED = 'paused',
  RESUMED = 'resumed',
  CANCELLED = 'cancelled',
  SKIPPED = 'skipped',
}

export enum WorkflowStatus {
  PENDING = 'pending',
  INITIALIZING = 'initializing',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMEOUT = 'timeout',
}

export enum TaskStatus {
  PENDING = 'pending',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMEOUT = 'timeout',
  RETRY = 'retry',
}

export enum AgentStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  READY = 'ready',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
}

export enum ExecutionStatus {
  PENDING = 'pending',
  INITIALIZING = 'initializing',
  RUNNING = 'running',
  PAUSED = 'paused',
  SUSPENDED = 'suspended',
  CHECKPOINTING = 'checkpointing',
  RECOVERING = 'recovering',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMED_OUT = 'timed_out',
}

export enum PluginStatus {
  LOADING = 'loading',
  LOADED = 'loaded',
  FAILED = 'failed',
  UNLOADING = 'unloading',
}

// =====================
// Log Levels & Contexts
// =====================

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export enum LogContext {
  SERVER = 'SERVER',
  WORKFLOW = 'WORKFLOW',
  TASK = 'TASK',
  AGENT = 'AGENT',
  VALIDATION = 'VALIDATION',
  RECOVERY = 'RECOVERY',
}

// =====================
// Source Types
// =====================

export enum SourceType {
  CLAUDE = 'claude',
  HOOK = 'hook',
}

export enum DataFormat {
  JSON = 'json',
  YAML = 'yaml',
}

// =====================
// Workflow Types
// =====================

export enum WorkflowType {
  BUG_FIX = 'bug-fix',
  FEATURE_DEVELOPMENT = 'feature-development',
}

// =====================
// Optimization Types
// =====================

export enum OptimizationType {
  PARALLELIZATION = 'parallelization',
  CACHING = 'caching',
  DEAD_CODE = 'dead_code',
  REDUNDANCY = 'redundancy',
  REORDERING = 'reordering',
}

// =====================
// Edge Types
// =====================

export enum EdgeType {
  SEQUENCE = 'sequence',
  PARALLEL = 'parallel',
  CONDITIONAL = 'conditional',
  LOOP = 'loop',
}

// =====================
// Notification Types
// =====================

export enum NotificationType {
  EMAIL = 'email',
  SLACK = 'slack',
  WEBHOOK = 'webhook',
  LOG = 'log',
}

// =====================
// Iterator Types
// =====================

export enum IteratorType {
  FOR = 'for',
  WHILE = 'while',
  FOREACH = 'foreach',
}

// =====================
// Variable Types
// =====================

export enum VariableType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  OBJECT = 'object',
  ARRAY = 'array',
  ANY = 'any',
}

// =====================
// Migration Types
// =====================

export enum MigrationType {
  ADD = 'add',
  REMOVE = 'remove',
  MODIFY = 'modify',
  RENAME = 'rename',
  RESTRUCTURE = 'restructure',
}

// =====================
// Layout Direction
// =====================

export enum LayoutDirection {
  TOP_BOTTOM = 'TB',
  BOTTOM_TOP = 'BT',
  LEFT_RIGHT = 'LR',
  RIGHT_LEFT = 'RL',
}

// =====================
// Layout Algorithm
// =====================

export enum LayoutAlgorithm {
  DAGRE = 'dagre',
  FORCE = 'force',
  GRID = 'grid',
  MANUAL = 'manual',
}

// =====================
// Port Types & Positions
// =====================

export enum PortType {
  INPUT = 'input',
  OUTPUT = 'output',
}

export enum PortPosition {
  TOP = 'top',
  RIGHT = 'right',
  BOTTOM = 'bottom',
  LEFT = 'left',
}

// =====================
// Node Shapes
// =====================

export enum NodeShape {
  RECTANGLE = 'rectangle',
  CIRCLE = 'circle',
  DIAMOND = 'diamond',
  HEXAGON = 'hexagon',
}

// =====================
// Validation Severity
// =====================

export enum ValidationSeverity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
}

// =====================
// Sorting
// =====================

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

// =====================
// Persistence Types
// =====================

export enum PersistenceType {
  REDIS = 'redis',
  SQLITE = 'sqlite',
  MEMORY = 'memory',
}

// =====================
// Result Status
// =====================

export enum ResultStatus {
  SUCCESS = 'success',
  FAILURE = 'failure',
  SKIPPED = 'skipped',
  TIMEOUT = 'timeout',
}

// =====================
// Context Status
// =====================

export enum ContextStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

// =====================
// Impact Level
// =====================

export enum ImpactLevel {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

// =====================
// Debugger Breakpoint Types
// =====================

export enum BreakpointType {
  TASK = 'task',
  STAGE = 'stage',
  LINE = 'line',
  ERROR = 'error',
  CONDITION = 'condition',
}

// =====================
// Debugger Action Types
// =====================

export enum DebuggerAction {
  LOG = 'log',
  SNAPSHOT = 'snapshot',
  EVALUATE = 'evaluate',
  MODIFY = 'modify',
}

// =====================
// Recovery Actions
// =====================

export enum RecoveryAction {
  UNDO = 'undo',
  RETRY = 'retry',
  SKIP = 'skip',
  REPLACE = 'replace',
}

// =====================
// Monitoring Export Types
// =====================

export enum MonitoringExportType {
  PROMETHEUS = 'prometheus',
  DATADOG = 'datadog',
  NEWRELIC = 'newrelic',
  CUSTOM = 'custom',
}

// =====================
// Trace Types
// =====================

export enum TraceType {
  TASK_START = 'task_start',
  TASK_END = 'task_end',
  STAGE_START = 'stage_start',
  STAGE_END = 'stage_end',
  VARIABLE_CHANGE = 'variable_change',
  ERROR = 'error',
  CHECKPOINT = 'checkpoint',
  RECOVERY = 'recovery',
  CUSTOM = 'custom',
}