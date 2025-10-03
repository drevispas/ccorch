import { MetricsCollector, SystemMetrics, Alert } from './metrics-collector.js';
import { Logger, LogEntry, LogFilter } from './logger.js';
import { WorkflowStateManager } from '../workflow-state-manager.js';
import { OrchestrationConfig } from '../types.js';
import { ORCHESTRATOR_CONFIG } from '../config/constants.js';

export interface DashboardData {
  timestamp: Date;
  systemMetrics: SystemMetrics;
  metricsSummary: {
    timeRange: string;
    totalWorkflows: number;
    successRate: number;
    averageExecutionTime: number;
    peakThroughput: number;
    errorCount: number;
    activeAlerts: number;
  };
  activeAlerts: Alert[];
  recentLogs: LogEntry[];
  workflowStats: {
    activeWorkflows: number;
    recentlyCompleted: Array<{
      id: string;
      name: string;
      duration: number;
      status: string;
    }>;
  };
  systemHealth: {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    recommendations: string[];
  };
}

export interface DashboardConfig {
  refreshInterval: number; // ms
  logLimit: number;
  metricsTimeRange: '1h' | '24h' | '7d';
  enableRealTimeUpdates: boolean;
}

export class MonitoringDashboard {
  private metricsCollector: MetricsCollector;
  private logger: Logger;
  private stateManager: WorkflowStateManager;
  private config: DashboardConfig;
  private updateInterval?: NodeJS.Timeout;
  private subscribers: Array<(data: DashboardData) => void> = [];

  constructor(
    metricsCollector: MetricsCollector,
    logger: Logger,
    stateManager: WorkflowStateManager,
    config: Partial<DashboardConfig> = {}
  ) {
    this.metricsCollector = metricsCollector;
    this.logger = logger;
    this.stateManager = stateManager;
    this.config = {
      refreshInterval: 30000, // 30 seconds
      logLimit: 100,
      metricsTimeRange: '24h',
      enableRealTimeUpdates: true,
      ...config
    };
  }

  async initialize(): Promise<void> {
    if (this.config.enableRealTimeUpdates) {
      this.startRealTimeUpdates();
    }
    this.logger.info('Monitoring dashboard initialized');
  }

  async shutdown(): Promise<void> {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.subscribers = [];
    this.logger.info('Monitoring dashboard shut down');
  }

  async getDashboardData(): Promise<DashboardData> {
    try {
      // Collect all dashboard data in parallel
      const [
        systemMetrics,
        metricsSummary,
        activeAlerts,
        recentLogs,
        workflowStats,
        systemHealth
      ] = await Promise.all([
        this.metricsCollector.collectSystemMetrics(),
        this.metricsCollector.getMetricsSummary(this.config.metricsTimeRange),
        this.metricsCollector.getActiveAlerts(),
        this.getRecentLogs(),
        this.getWorkflowStats(),
        this.assessSystemHealth()
      ]);

      return {
        timestamp: new Date(),
        systemMetrics,
        metricsSummary,
        activeAlerts,
        recentLogs,
        workflowStats,
        systemHealth
      };
    } catch (error) {
      this.logger.error('Failed to collect dashboard data', error);
      throw error;
    }
  }

  async generateReport(timeRange: '1h' | '24h' | '7d' = '24h'): Promise<string> {
    const data = await this.getDashboardData();
    const summary = await this.metricsCollector.getMetricsSummary(timeRange);
    const logStats = await this.logger.getLogStats(this.getTimeRangeFilter(timeRange));

    return this.formatReport(data, summary, logStats);
  }

  async getSystemStatus(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    uptime: number;
    version: string;
    activeWorkflows: number;
    totalProcessed: number;
    errorRate: number;
    lastUpdate: Date;
  }> {
    const data = await this.getDashboardData();

    return {
      status: data.systemHealth.status,
      uptime: process.uptime() * 1000, // Convert to milliseconds
      version: '1.0.0', // Could be read from package.json
      activeWorkflows: data.workflowStats.activeWorkflows,
      totalProcessed: data.metricsSummary.totalWorkflows,
      errorRate: data.metricsSummary.errorCount > 0 ?
        (data.metricsSummary.errorCount / data.metricsSummary.totalWorkflows) * 100 : 0,
      lastUpdate: data.timestamp
    };
  }

  subscribe(callback: (data: DashboardData) => void): () => void {
    this.subscribers.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.subscribers.indexOf(callback);
      if (index >= 0) {
        this.subscribers.splice(index, 1);
      }
    };
  }

  private async getRecentLogs(): Promise<LogEntry[]> {
    const filter: LogFilter = {
      limit: this.config.logLimit,
      timeRange: this.getTimeRangeFilter('1h') // Recent logs from last hour
    };

    return this.logger.getLogs(filter);
  }

  private async getWorkflowStats(): Promise<DashboardData['workflowStats']> {
    try {
      const activeWorkflows = await this.stateManager.listActiveWorkflows();

      // Get recently completed workflows from archived state
      // Note: This is a simplified implementation - in production,
      // you might want to implement a proper archived workflow query
      let recentlyCompleted: Array<{
        id: string;
        name: string;
        duration: number;
        status: string;
      }> = [];

      // Archived workflow retrieval - placeholder for future archive integration
      try {
        // Note: Archive manager integration would be added here when available
        recentlyCompleted = [];
      } catch (error) {
        console.warn(`Could not retrieve archived workflows: ${(error as Error).message}`);
        recentlyCompleted = [];
      }

      return {
        activeWorkflows: activeWorkflows.length,
        recentlyCompleted
      };
    } catch (error) {
      this.logger.error('Failed to get workflow stats', error);
      return {
        activeWorkflows: 0,
        recentlyCompleted: []
      };
    }
  }

  private async assessSystemHealth(): Promise<DashboardData['systemHealth']> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check metrics for health indicators
    const metrics = await this.metricsCollector.collectSystemMetrics();
    const alerts = await this.metricsCollector.getActiveAlerts();

    // Critical issues
    if (metrics.errorRate > 20) {
      issues.push('High error rate detected');
      recommendations.push('Investigate failing workflows and address root causes');
    }

    if (metrics.resourceUsage.memoryUsage > 1000) {
      issues.push('High memory usage');
      recommendations.push('Consider scaling resources or optimizing memory usage');
    }

    if (alerts.filter(a => a.severity === 'critical').length > 0) {
      issues.push('Critical alerts active');
      recommendations.push('Address critical alerts immediately');
    }

    // Warning conditions
    if (metrics.averageExecutionTime > 180000) { // 3 minutes
      issues.push('Long average execution time');
      recommendations.push('Review workflow efficiency and optimize slow steps');
    }

    if (metrics.throughput < 0.5 && metrics.activeWorkflows > 5) {
      issues.push('Low throughput with active workloads');
      recommendations.push('Check for bottlenecks in workflow execution');
    }

    // Determine overall status
    let status: DashboardData['systemHealth']['status'] = 'healthy';

    if (alerts.some(a => a.severity === 'critical') || metrics.errorRate > 25) {
      status = 'critical';
    } else if (issues.length > 0 || alerts.some(a => a.severity === 'high')) {
      status = 'warning';
    }

    return { status, issues, recommendations };
  }

  private getTimeRangeFilter(timeRange: '1h' | '24h' | '7d'): { start: Date; end: Date } {
    const end = new Date();
    const start = new Date();

    switch (timeRange) {
      case '1h':
        start.setHours(end.getHours() - 1);
        break;
      case '24h':
        start.setDate(end.getDate() - 1);
        break;
      case '7d':
        start.setDate(end.getDate() - 7);
        break;
    }

    return { start, end };
  }

  private formatReport(
    data: DashboardData,
    summary: any,
    logStats: any
  ): string {
    const { systemHealth, metricsSummary, activeAlerts } = data;

    return `# Orchestration System Report
Generated: ${data.timestamp.toISOString()}

## System Status: ${systemHealth.status.toUpperCase()}

### Metrics Summary (${summary.timeRange})
- Total Workflows: ${summary.totalWorkflows}
- Success Rate: ${summary.successRate}%
- Average Execution Time: ${Math.round(summary.averageExecutionTime / 1000)}s
- Peak Throughput: ${summary.peakThroughput} workflows/hour
- Error Count: ${summary.errorCount}

### Current System State
- Active Workflows: ${data.systemMetrics.activeWorkflows}
- Memory Usage: ${Math.round(data.systemMetrics.resourceUsage.memoryUsage)}MB
- Active Alerts: ${activeAlerts.length}

### Alerts
${activeAlerts.length > 0 ?
  activeAlerts.map(alert =>
    `- [${alert.severity.toUpperCase()}] ${alert.message} (${alert.timestamp.toLocaleString()})`
  ).join('\n') :
  'No active alerts'
}

### Health Issues
${systemHealth.issues.length > 0 ?
  systemHealth.issues.map(issue => `- ${issue}`).join('\n') :
  'No issues detected'
}

### Recommendations
${systemHealth.recommendations.length > 0 ?
  systemHealth.recommendations.map(rec => `- ${rec}`).join('\n') :
  'No recommendations at this time'
}

### Log Statistics
- Total Log Entries: ${logStats.totalLogs}
- Error Rate: ${logStats.errorRate}%
- Top Components: ${Object.entries(logStats.logsByComponent)
  .sort(([,a], [,b]) => (b as number) - (a as number))
  .slice(0, 3)
  .map(([comp, count]) => `${comp}(${count})`)
  .join(', ')}

${logStats.topErrors.length > 0 ?
  `### Top Errors:\n${logStats.topErrors
    .slice(0, 5)
    .map(err => `- ${err.message} (${err.count} occurrences)`)
    .join('\n')}` :
  ''
}
`;
  }

  private startRealTimeUpdates(): void {
    this.updateInterval = setInterval(async () => {
      try {
        const data = await this.getDashboardData();
        this.notifySubscribers(data);
      } catch (error) {
        this.logger.error('Failed to update dashboard data', error);
      }
    }, this.config.refreshInterval);

    this.logger.info('Started real-time dashboard updates', {} as any);
  }

  private notifySubscribers(data: DashboardData): void {
    this.subscribers.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        this.logger.error('Error notifying dashboard subscriber', error);
      }
    });
  }
}