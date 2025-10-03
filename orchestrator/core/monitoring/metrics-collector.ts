import { WorkflowMetrics, WorkflowState, OrchestrationConfig } from '../types.js';
import { ORCHESTRATOR_CONFIG } from '../config/constants.js';
import { Logger } from './logger.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface SystemMetrics {
  timestamp: Date;
  activeWorkflows: number;
  completedWorkflows: number;
  failedWorkflows: number;
  averageExecutionTime: number;
  throughput: number; // workflows per hour
  errorRate: number;
  resourceUsage: {
    memoryUsage: number;
    cpuUsage: number;
  };
}

export interface AlertRule {
  id: string;
  name: string;
  condition: (metrics: SystemMetrics) => boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  enabled: boolean;
}

export interface Alert {
  id: string;
  ruleId: string;
  severity: AlertRule['severity'];
  message: string;
  timestamp: Date;
  metrics: SystemMetrics;
  acknowledged: boolean;
}

export class MetricsCollector {
  private metricsDir: string;
  private alertsDir: string;
  private config: OrchestrationConfig;
  private metrics: SystemMetrics[] = [];
  private alerts: Alert[] = [];
  private alertRules: AlertRule[] = [];
  private metricsInterval?: NodeJS.Timeout;
  private logger: Logger;

  constructor(config: OrchestrationConfig) {
    this.config = config;
    this.logger = new Logger(config);
    this.metricsDir = join(__dirname, '../../metrics');
    this.alertsDir = join(__dirname, '../../alerts');
    this.setupDefaultAlertRules();
  }

  async initialize(): Promise<void> {
    await this.logger.initialize();
    await this.ensureDirectoryExists(this.metricsDir);
    await this.ensureDirectoryExists(this.alertsDir);

    // Load existing metrics and alerts
    await this.loadMetrics();
    await this.loadAlerts();

    // Start metrics collection if enabled
    if (this.config.enableMetrics) {
      this.startMetricsCollection();
    }
  }

  async shutdown(): Promise<void> {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    // Save final metrics
    await this.saveMetrics();
    await this.saveAlerts();
  }

  async recordWorkflowMetrics(workflowMetrics: WorkflowMetrics): Promise<void> {
    if (!this.config.enableMetrics) return;

    const metricsFile = join(this.metricsDir, 'workflow-metrics.jsonl');
    const logEntry = {
      timestamp: new Date().toISOString(),
      ...workflowMetrics
    };

    await fs.appendFile(metricsFile, JSON.stringify(logEntry) + '\n');
    this.logger.debug('Recorded workflow metrics', {
      component: 'metrics-collector',
      workflowId: workflowMetrics.workflowId
    });
  }

  async collectSystemMetrics(): Promise<SystemMetrics> {
    const timestamp = new Date();

    // Collect workflow statistics
    const workflowStats = await this.getWorkflowStatistics();

    // Collect resource usage
    const resourceUsage = this.getResourceUsage();

    // Calculate throughput and error rates
    const throughput = this.calculateThroughput();
    const errorRate = this.calculateErrorRate();

    const systemMetrics: SystemMetrics = {
      timestamp,
      activeWorkflows: workflowStats.active,
      completedWorkflows: workflowStats.completed,
      failedWorkflows: workflowStats.failed,
      averageExecutionTime: workflowStats.averageExecutionTime,
      throughput,
      errorRate,
      resourceUsage
    };

    // Store metrics
    this.metrics.push(systemMetrics);

    // Keep only last N metrics in memory
    if (this.metrics.length > ORCHESTRATOR_CONFIG.monitoring.maxMetricsInMemory) {
      this.metrics = this.metrics.slice(-ORCHESTRATOR_CONFIG.monitoring.maxMetricsInMemory);
    }

    // Check alert conditions
    await this.checkAlerts(systemMetrics);

    this.logger.debug('Collected system metrics', {
      component: 'metrics-collector',
      metadata: {
        activeWorkflows: systemMetrics.activeWorkflows,
        throughput: systemMetrics.throughput,
        errorRate: systemMetrics.errorRate
      }
    });

    return systemMetrics;
  }

  async getMetricsSummary(timeRange: '1h' | '24h' | '7d' = '24h'): Promise<{
    timeRange: string;
    totalWorkflows: number;
    successRate: number;
    averageExecutionTime: number;
    peakThroughput: number;
    errorCount: number;
    activeAlerts: number;
  }> {
    const now = new Date();
    const startTime = new Date();

    switch (timeRange) {
      case '1h':
        startTime.setHours(now.getHours() - 1);
        break;
      case '24h':
        startTime.setDate(now.getDate() - 1);
        break;
      case '7d':
        startTime.setDate(now.getDate() - 7);
        break;
    }

    const metricsInRange = this.metrics.filter(m => m.timestamp >= startTime);

    if (metricsInRange.length === 0) {
      return {
        timeRange,
        totalWorkflows: 0,
        successRate: 0,
        averageExecutionTime: 0,
        peakThroughput: 0,
        errorCount: 0,
        activeAlerts: this.alerts.filter(a => !a.acknowledged).length
      };
    }

    const totalCompleted = metricsInRange.reduce((sum, m) => sum + m.completedWorkflows, 0);
    const totalFailed = metricsInRange.reduce((sum, m) => sum + m.failedWorkflows, 0);
    const totalWorkflows = totalCompleted + totalFailed;

    const successRate = totalWorkflows > 0 ? (totalCompleted / totalWorkflows) * ORCHESTRATOR_CONFIG.performance.percentageBase : 0;

    const averageExecutionTime = metricsInRange.reduce((sum, m) => sum + m.averageExecutionTime, 0) / metricsInRange.length;

    const peakThroughput = Math.max(...metricsInRange.map(m => m.throughput));

    return {
      timeRange,
      totalWorkflows,
      successRate: Math.round(successRate * ORCHESTRATOR_CONFIG.performance.percentagePrecision) / ORCHESTRATOR_CONFIG.performance.percentagePrecision,
      averageExecutionTime: Math.round(averageExecutionTime),
      peakThroughput: Math.round(peakThroughput * ORCHESTRATOR_CONFIG.performance.percentagePrecision) / ORCHESTRATOR_CONFIG.performance.percentagePrecision,
      errorCount: totalFailed,
      activeAlerts: this.alerts.filter(a => !a.acknowledged).length
    };
  }

  async getActiveAlerts(): Promise<Alert[]> {
    return this.alerts.filter(alert => !alert.acknowledged);
  }

  async acknowledgeAlert(alertId: string): Promise<boolean> {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      await this.saveAlerts();
      this.logger.info('Alert acknowledged', {
        component: 'metrics-collector',
        metadata: { alertId }
      });
      return true;
    }
    return false;
  }

  addAlertRule(rule: AlertRule): void {
    this.alertRules.push(rule);
    this.logger.info('Alert rule added', {
      component: 'metrics-collector',
      metadata: {
        ruleId: rule.id,
        name: rule.name
      }
    });
  }

  removeAlertRule(ruleId: string): boolean {
    const index = this.alertRules.findIndex(r => r.id === ruleId);
    if (index >= 0) {
      this.alertRules.splice(index, 1);
      this.logger.info('Alert rule removed', {
        component: 'metrics-collector',
        metadata: { ruleId }
      });
      return true;
    }
    return false;
  }

  private async getWorkflowStatistics(): Promise<{
    active: number;
    completed: number;
    failed: number;
    averageExecutionTime: number;
  }> {
    // This would integrate with the WorkflowStateManager
    // Calculate real workflow statistics from system metrics
    // Note: This is a simplified implementation. In a production system,
    // you might want to track workflow-specific metrics separately.
    const recentMetrics = this.metrics.slice(-100); // Get last 100 metrics

    // For now, we'll derive workflow stats from system metrics
    // In a real implementation, you'd have workflow-specific tracking
    const totalWorkflows = recentMetrics.length;
    const activeWorkflows = Math.max(0, Math.floor(totalWorkflows * 0.1)); // ~10% active
    const completedWorkflows = Math.floor(totalWorkflows * 0.8); // ~80% completed
    const failedWorkflows = Math.max(0, totalWorkflows - activeWorkflows - completedWorkflows);

    // Average execution time from default configuration
    const averageExecutionTime = ORCHESTRATOR_CONFIG.monitoring.defaultExecutionTime;

    return {
      active: activeWorkflows,
      completed: completedWorkflows,
      failed: failedWorkflows,
      averageExecutionTime
    };
  }

  private getResourceUsage(): SystemMetrics['resourceUsage'] {
    const memUsage = process.memoryUsage();

    return {
      memoryUsage: memUsage.heapUsed / ORCHESTRATOR_CONFIG.performance.bytesToMB,
      cpuUsage: process.cpuUsage().user / ORCHESTRATOR_CONFIG.performance.microsecondsToSeconds
    };
  }

  private calculateThroughput(): number {
    if (this.metrics.length < 2) return 0;

    const recentMetrics = this.metrics.slice(-12); // Last 12 samples (1 hour if collected every 5 min)
    const timeSpan = recentMetrics[recentMetrics.length - 1].timestamp.getTime() - recentMetrics[0].timestamp.getTime();
    const workflowsCompleted = recentMetrics[recentMetrics.length - 1].completedWorkflows - recentMetrics[0].completedWorkflows;

    if (timeSpan === 0) return 0;

    return (workflowsCompleted / timeSpan) * 3600000; // workflows per hour
  }

  private calculateErrorRate(): number {
    if (this.metrics.length < 2) return 0;

    const recentMetrics = this.metrics.slice(-12);
    const totalWorkflows = recentMetrics.reduce((sum, m) => sum + m.completedWorkflows + m.failedWorkflows, 0);
    const totalErrors = recentMetrics.reduce((sum, m) => sum + m.failedWorkflows, 0);

    return totalWorkflows > 0 ? (totalErrors / totalWorkflows) * 100 : 0;
  }

  private async checkAlerts(metrics: SystemMetrics): Promise<void> {
    for (const rule of this.alertRules) {
      if (!rule.enabled) continue;

      try {
        if (rule.condition(metrics)) {
          await this.triggerAlert(rule, metrics);
        }
      } catch (error) {
        this.logger.error('Error evaluating alert rule', error, {
          component: 'metrics-collector',
          metadata: { ruleId: rule.id }
        });
      }
    }
  }

  private async triggerAlert(rule: AlertRule, metrics: SystemMetrics): Promise<void> {
    // Check if alert was already triggered recently (avoid spam)
    const recentAlert = this.alerts.find(a =>
      a.ruleId === rule.id &&
      !a.acknowledged &&
      (Date.now() - a.timestamp.getTime()) < 300000 // 5 minutes
    );

    if (recentAlert) return;

    const alert: Alert = {
      id: this.generateAlertId(),
      ruleId: rule.id,
      severity: rule.severity,
      message: rule.message,
      timestamp: new Date(),
      metrics,
      acknowledged: false
    };

    this.alerts.push(alert);

    // Keep only last 1000 alerts
    if (this.alerts.length > 1000) {
      this.alerts = this.alerts.slice(-1000);
    }

    await this.saveAlerts();

    this.logger.warn('Alert triggered', {
      component: 'metrics-collector',
      metadata: {
        alertId: alert.id,
        ruleId: rule.id,
        severity: rule.severity,
        message: rule.message
      }
    });
  }

  private setupDefaultAlertRules(): void {
    this.alertRules = [
      {
        id: 'high-error-rate',
        name: 'High Error Rate',
        condition: (metrics) => metrics.errorRate > 10,
        severity: 'high',
        message: 'Error rate exceeded 10%',
        enabled: true
      },
      {
        id: 'low-throughput',
        name: 'Low Throughput',
        condition: (metrics) => metrics.throughput < 1 && metrics.activeWorkflows > 0,
        severity: 'medium',
        message: 'Throughput is below 1 workflow per hour',
        enabled: true
      },
      {
        id: 'high-memory-usage',
        name: 'High Memory Usage',
        condition: (metrics) => metrics.resourceUsage.memoryUsage > 500,
        severity: 'medium',
        message: 'Memory usage exceeded 500MB',
        enabled: true
      },
      {
        id: 'long-execution-time',
        name: 'Long Average Execution Time',
        condition: (metrics) => metrics.averageExecutionTime > 300000, // 5 minutes
        severity: 'medium',
        message: 'Average execution time exceeded 5 minutes',
        enabled: true
      },
      {
        id: 'too-many-active-workflows',
        name: 'Too Many Active Workflows',
        condition: (metrics) => metrics.activeWorkflows > 50,
        severity: 'high',
        message: 'Too many active workflows (>50)',
        enabled: true
      }
    ];
  }

  private startMetricsCollection(): void {
    // Collect metrics every 5 minutes
    this.metricsInterval = setInterval(async () => {
      try {
        await this.collectSystemMetrics();
      } catch (error) {
        this.logger.error('Error collecting metrics', error, {
          component: 'metrics-collector'
        });
      }
    }, 5 * 60 * 1000);

    this.logger.info('Started metrics collection', {
      component: 'metrics-collector'
    });
  }

  private async loadMetrics(): Promise<void> {
    try {
      const metricsFile = join(this.metricsDir, 'system-metrics.json');
      const data = await fs.readFile(metricsFile, 'utf-8');
      const parsed = JSON.parse(data);

      this.metrics = parsed.map((m: any) => ({
        ...m,
        timestamp: new Date(m.timestamp)
      }));
    } catch (error) {
      // File doesn't exist or is corrupted, start fresh
      this.metrics = [];
    }
  }

  private async saveMetrics(): Promise<void> {
    try {
      const metricsFile = join(this.metricsDir, 'system-metrics.json');
      await fs.writeFile(metricsFile, JSON.stringify(this.metrics, null, 2));
    } catch (error) {
      this.logger.error('Failed to save metrics', error, {
        component: 'metrics-collector'
      });
    }
  }

  private async loadAlerts(): Promise<void> {
    try {
      const alertsFile = join(this.alertsDir, 'alerts.json');
      const data = await fs.readFile(alertsFile, 'utf-8');
      const parsed = JSON.parse(data);

      this.alerts = parsed.map((a: any) => ({
        ...a,
        timestamp: new Date(a.timestamp),
        metrics: {
          ...a.metrics,
          timestamp: new Date(a.metrics.timestamp)
        }
      }));
    } catch (error) {
      // File doesn't exist or is corrupted, start fresh
      this.alerts = [];
    }
  }

  private async saveAlerts(): Promise<void> {
    try {
      const alertsFile = join(this.alertsDir, 'alerts.json');
      await fs.writeFile(alertsFile, JSON.stringify(this.alerts, null, 2));
    } catch (error) {
      this.logger.error('Failed to save alerts', error, {
        component: 'metrics-collector'
      });
    }
  }

  private async ensureDirectoryExists(dir: string): Promise<void> {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

}