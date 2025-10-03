export { MetricsCollector } from './metrics-collector.js';
export { Logger } from './logger.js';
export { MonitoringDashboard } from './dashboard.js';

export type {
  SystemMetrics,
  AlertRule,
  Alert
} from './metrics-collector.js';

export type {
  LogEntry,
  LogFilter
} from './logger.js';

export type {
  DashboardData,
  DashboardConfig
} from './dashboard.js';

// Create a monitoring system factory
import { MetricsCollector } from './metrics-collector.js';
import { Logger } from './logger.js';
import { MonitoringDashboard } from './dashboard.js';
import { WorkflowStateManager } from '../workflow-state-manager.js';
import { OrchestrationConfig } from '../types.js';

export interface MonitoringSystem {
  metricsCollector: MetricsCollector;
  logger: Logger;
  dashboard: MonitoringDashboard;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}

export async function createMonitoringSystem(
  config: OrchestrationConfig,
  stateManager: WorkflowStateManager
): Promise<MonitoringSystem> {
  const metricsCollector = new MetricsCollector(config);
  const logger = new Logger(config);
  const dashboard = new MonitoringDashboard(metricsCollector, logger, stateManager);

  const monitoringSystem: MonitoringSystem = {
    metricsCollector,
    logger,
    dashboard,

    async initialize() {
      await metricsCollector.initialize();
      await logger.initialize();
      await dashboard.initialize();
    },

    async shutdown() {
      await dashboard.shutdown();
      await metricsCollector.shutdown();
      await logger.shutdown();
    }
  };

  return monitoringSystem;
}