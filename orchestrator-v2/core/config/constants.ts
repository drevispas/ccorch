export const ORCHESTRATOR_CONFIG = {
  DEFAULT_PORT: 3001,
  DEFAULT_HOST: 'localhost',
  DEFAULT_LOG_LEVEL: 'info',
  DEFAULT_TIMEOUT: 30000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  MAX_CONCURRENT_TASKS: 5,
  TASK_QUEUE_SIZE: 100,
  SESSION_TIMEOUT: 3600000, // 1 hour
  HEARTBEAT_INTERVAL: 5000,
  CLEANUP_INTERVAL: 60000,
  MAX_LOG_SIZE: 10485760, // 10MB
  LOG_ROTATION_COUNT: 5,
  CACHE_TTL: 300000, // 5 minutes
  SNAPSHOT_INTERVAL: 60000, // 1 minute
  EVENT_HISTORY_LIMIT: 1000,
  METRICS_INTERVAL: 10000,

  // Workflow defaults
  DEFAULT_WORKFLOW_TIMEOUT: 3600000, // 1 hour
  DEFAULT_TASK_TIMEOUT: 300000, // 5 minutes

  // Agent defaults
  DEFAULT_AGENT_TIMEOUT: 120000, // 2 minutes
  AGENT_POOL_SIZE: 10,

  // State management
  STATE_PERSIST_INTERVAL: 30000,
  STATE_BACKUP_COUNT: 3,

  // API rate limiting
  API_RATE_LIMIT: 100,
  API_RATE_WINDOW: 60000, // 1 minute

  // Claude integration timeouts
  timeouts: {
    claudeIntegration: {
      agentExecutionTimeout: 120000 // 2 minutes
    }
  }
};