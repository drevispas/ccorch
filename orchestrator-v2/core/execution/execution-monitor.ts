import { EventEmitter } from 'events';
import { Observable, Subject, BehaviorSubject, interval, combineLatest, Subscription } from 'rxjs';
import { map, filter, scan, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import {
  ExecutionMetrics,
  TaskMetrics,
  Alert,
  AlertThresholds,
  MonitoringConfig,
  CustomMetric,
  MetricExporter,
  ExecutionContext,
  TaskExecution,
  ExecutionEvent,
  ExecutionEventType,
} from './types';

export interface MetricCollector {
  name: string;
  collect(): Promise<Record<string, number>>;
}

export class SystemMetricsCollector implements MetricCollector {
  name = 'system';

  async collect(): Promise<Record<string, number>> {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      'memory.heapUsed': memUsage.heapUsed,
      'memory.heapTotal': memUsage.heapTotal,
      'memory.rss': memUsage.rss,
      'memory.external': memUsage.external,
      'cpu.user': cpuUsage.user,
      'cpu.system': cpuUsage.system,
      'process.uptime': process.uptime(),
    };
  }
}

export class ExecutionMonitor extends EventEmitter {
  private config: MonitoringConfig;
  private metrics$ = new BehaviorSubject<ExecutionMetrics | null>(null);
  private alerts$ = new Subject<Alert>();
  private events$ = new Subject<ExecutionEvent>();
  private taskMetrics$ = new Subject<TaskMetrics>();

  private activeExecutions: Map<string, ExecutionContext> = new Map();
  private taskExecutions: Map<string, TaskExecution> = new Map();
  private metricCollectors: Map<string, MetricCollector> = new Map();
  private customMetrics: Map<string, CustomMetric> = new Map();
  private metricHistory: Map<string, number[]> = new Map();
  private alertHistory: Alert[] = [];

  private collectionTimer?: NodeJS.Timeout;
  private alertSubscription?: Subscription;
  private currentMetrics: ExecutionMetrics = this.getInitialMetrics();

  constructor(config: MonitoringConfig) {
    super();

    this.config = {
      metricsInterval: config.metricsInterval || 5000,
      metricsRetention: config.metricsRetention || 3600000, // 1 hour
      alertThresholds: {
        errorRate: config.alertThresholds?.errorRate ?? 0.05, // 5%
        taskDuration: config.alertThresholds?.taskDuration ?? 300000, // 5 minutes
        memoryUsage: config.alertThresholds?.memoryUsage ?? 0.9, // 90%
        cpuUsage: config.alertThresholds?.cpuUsage ?? 0.8, // 80%
        queueLength: config.alertThresholds?.queueLength ?? 1000,
        circuitBreakerOpen: config.alertThresholds?.circuitBreakerOpen ?? true,
      },
      customMetrics: config.customMetrics || [],
      exporters: config.exporters || [],
    };

    this.initializeCollectors();
    // Only start collection if not in test environment
    if (process.env.NODE_ENV !== 'test') {
      this.startCollection();
      this.setupAlertMonitoring();
    }
  }

  public async initialize(): Promise<void> {
    // ExecutionMonitor is initialized in constructor
    // This method is provided for interface compatibility
  }

  public startMonitoring(): void {
    if (!this.collectionTimer) {
      this.startCollection();
    }
    if (!this.alertSubscription) {
      this.setupAlertMonitoring();
    }
  }

  private getInitialMetrics(): ExecutionMetrics {
    return {
      startTime: Date.now(),
      tasksTotal: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      tasksSkipped: 0,
      avgTaskDuration: 0,
      p50TaskDuration: 0,
      p95TaskDuration: 0,
      p99TaskDuration: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      throughput: 0,
      errorRate: 0,
      retryRate: 0,
      checkpointCount: 0,
      recoveryCount: 0,
    };
  }

  private initializeCollectors(): void {
    // Add system metrics collector
    this.metricCollectors.set('system', new SystemMetricsCollector());

    // Initialize custom metrics
    if (this.config.customMetrics) {
      for (const customMetric of this.config.customMetrics) {
        this.customMetrics.set(customMetric.name, customMetric);
        this.metricHistory.set(customMetric.name, []);
      }
    }
  }

  private startCollection(): void {
    this.collectionTimer = setInterval(async () => {
      await this.collectMetrics();
    }, this.config.metricsInterval);
    // Allow Node.js to exit even if timer is active
    if (this.collectionTimer.unref) {
      this.collectionTimer.unref();
    }
  }

  private async collectMetrics(): Promise<void> {
    try {
      const metrics = await this.calculateCurrentMetrics();
      this.currentMetrics = metrics;
      this.metrics$.next(metrics);

      // Store in history
      this.storeMetricHistory('execution_metrics', Date.now());

      // Check thresholds and generate alerts
      this.checkAlertThresholds(metrics);

      // Export metrics if exporters are configured
      await this.exportMetrics(metrics);

      this.emit('metrics:collected', metrics);
    } catch (error) {
      console.error('Failed to collect metrics:', error);
      this.emit('metrics:error', error);
    }
  }

  private async calculateCurrentMetrics(): Promise<ExecutionMetrics> {
    const now = Date.now();
    const executions = Array.from(this.activeExecutions.values());
    const taskExecutions = Array.from(this.taskExecutions.values());

    // Calculate basic task metrics
    const tasksTotal = taskExecutions.length;
    const tasksCompleted = taskExecutions.filter(t => t.status === 'completed').length;
    const tasksFailed = taskExecutions.filter(t => t.status === 'failed').length;
    const tasksSkipped = taskExecutions.filter(t => t.status === 'skipped').length;

    // Calculate durations for completed tasks
    const completedTasks = taskExecutions.filter(t =>
      t.status === 'completed' && t.metrics?.executionTime
    );

    const durations = completedTasks
      .map(t => t.metrics!.executionTime)
      .filter(d => d > 0)
      .sort((a, b) => a - b);

    const avgTaskDuration = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : 0;

    const p50TaskDuration = durations.length > 0
      ? durations[Math.floor(durations.length * 0.5)]
      : 0;

    const p95TaskDuration = durations.length > 0
      ? durations[Math.floor(durations.length * 0.95)]
      : 0;

    const p99TaskDuration = durations.length > 0
      ? durations[Math.floor(durations.length * 0.99)]
      : 0;

    // Collect system metrics
    const systemMetrics = await this.collectSystemMetrics();

    // Calculate rates
    const timeWindow = 60000; // 1 minute
    const recentTasks = taskExecutions.filter(t =>
      t.lastAttemptAt && (now - t.lastAttemptAt.getTime()) <= timeWindow
    );

    const throughput = recentTasks.length / (timeWindow / 1000); // tasks per second
    const errorRate = recentTasks.length > 0
      ? recentTasks.filter(t => t.status === 'failed').length / recentTasks.length
      : 0;

    const retryRate = recentTasks.length > 0
      ? recentTasks.filter(t => t.attempts > 1).length / recentTasks.length
      : 0;

    return {
      startTime: this.currentMetrics.startTime,
      endTime: now,
      duration: now - this.currentMetrics.startTime,
      tasksTotal,
      tasksCompleted,
      tasksFailed,
      tasksSkipped,
      avgTaskDuration,
      p50TaskDuration,
      p95TaskDuration,
      p99TaskDuration,
      cpuUsage: systemMetrics.cpuUsage || 0,
      memoryUsage: systemMetrics.memoryUsage || 0,
      throughput,
      errorRate,
      retryRate,
      checkpointCount: this.currentMetrics.checkpointCount,
      recoveryCount: this.currentMetrics.recoveryCount,
    };
  }

  private async collectSystemMetrics(): Promise<Record<string, number>> {
    const allMetrics: Record<string, number> = {};

    for (const [name, collector] of this.metricCollectors) {
      try {
        const metrics = await collector.collect();
        for (const [key, value] of Object.entries(metrics)) {
          allMetrics[`${name}.${key}`] = value;
        }
      } catch (error) {
        console.error(`Failed to collect metrics from ${name}:`, error);
      }
    }

    // Calculate derived metrics
    if (allMetrics['system.memory.heapUsed'] && allMetrics['system.memory.heapTotal']) {
      allMetrics.memoryUsage = allMetrics['system.memory.heapUsed'] / allMetrics['system.memory.heapTotal'];
    }

    // CPU usage calculation would need more sophisticated monitoring
    allMetrics.cpuUsage = 0.1; // Placeholder

    return allMetrics;
  }

  private storeMetricHistory(metricName: string, value: number): void {
    let history = this.metricHistory.get(metricName);
    if (!history) {
      history = [];
      this.metricHistory.set(metricName, history);
    }

    history.push(value);

    // Maintain retention limit
    const maxEntries = this.config.metricsRetention / this.config.metricsInterval;
    if (history.length > maxEntries) {
      history.shift();
    }
  }

  private checkAlertThresholds(metrics: ExecutionMetrics): void {
    const thresholds = this.config.alertThresholds;
    const now = new Date();

    // Check error rate
    if (metrics.errorRate > thresholds.errorRate) {
      this.createAlert({
        severity: 'error',
        type: 'high_error_rate',
        message: `Error rate ${(metrics.errorRate * 100).toFixed(1)}% exceeds threshold ${(thresholds.errorRate * 100).toFixed(1)}%`,
        source: 'execution_monitor',
        timestamp: now,
        metadata: { errorRate: metrics.errorRate, threshold: thresholds.errorRate },
      });
    }

    // Check task duration
    if (metrics.p95TaskDuration > thresholds.taskDuration) {
      this.createAlert({
        severity: 'warning',
        type: 'slow_tasks',
        message: `P95 task duration ${metrics.p95TaskDuration}ms exceeds threshold ${thresholds.taskDuration}ms`,
        source: 'execution_monitor',
        timestamp: now,
        metadata: { p95Duration: metrics.p95TaskDuration, threshold: thresholds.taskDuration },
      });
    }

    // Check memory usage
    if (metrics.memoryUsage > thresholds.memoryUsage) {
      this.createAlert({
        severity: 'critical',
        type: 'high_memory_usage',
        message: `Memory usage ${(metrics.memoryUsage * 100).toFixed(1)}% exceeds threshold ${(thresholds.memoryUsage * 100).toFixed(1)}%`,
        source: 'execution_monitor',
        timestamp: now,
        metadata: { memoryUsage: metrics.memoryUsage, threshold: thresholds.memoryUsage },
      });
    }

    // Check CPU usage
    if (metrics.cpuUsage > thresholds.cpuUsage) {
      this.createAlert({
        severity: 'warning',
        type: 'high_cpu_usage',
        message: `CPU usage ${(metrics.cpuUsage * 100).toFixed(1)}% exceeds threshold ${(thresholds.cpuUsage * 100).toFixed(1)}%`,
        source: 'execution_monitor',
        timestamp: now,
        metadata: { cpuUsage: metrics.cpuUsage, threshold: thresholds.cpuUsage },
      });
    }
  }

  private setupAlertMonitoring(): void {
    // Monitor for patterns that might indicate issues
    this.alertSubscription = this.metrics$
      .pipe(
        filter(metrics => metrics !== null),
        debounceTime(30000), // 30 second debounce
        distinctUntilChanged((prev, curr) =>
          prev!.errorRate === curr!.errorRate &&
          prev!.throughput === curr!.throughput
        )
      )
      .subscribe(metrics => {
        if (metrics) {
          this.analyzeMetricTrends(metrics);
        }
      });
  }

  private analyzeMetricTrends(metrics: ExecutionMetrics): void {
    const errorRateHistory = this.metricHistory.get('error_rate') || [];
    const throughputHistory = this.metricHistory.get('throughput') || [];

    // Check for increasing error rate trend
    if (errorRateHistory.length >= 5) {
      const recent = errorRateHistory.slice(-5);
      const trend = this.calculateTrend(recent);

      if (trend > 0.02) { // 2% increase trend
        this.createAlert({
          severity: 'warning',
          type: 'error_rate_trend',
          message: 'Error rate is trending upward',
          source: 'execution_monitor',
          timestamp: new Date(),
          metadata: { trend, recentValues: recent },
        });
      }
    }

    // Check for decreasing throughput trend
    if (throughputHistory.length >= 5) {
      const recent = throughputHistory.slice(-5);
      const trend = this.calculateTrend(recent);

      if (trend < -0.5) { // 0.5 decrease trend
        this.createAlert({
          severity: 'info',
          type: 'throughput_decline',
          message: 'Throughput is declining',
          source: 'execution_monitor',
          timestamp: new Date(),
          metadata: { trend, recentValues: recent },
        });
      }
    }
  }

  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;

    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, idx) => sum + (idx * val), 0);
    const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;

    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  }

  private createAlert(alertData: Omit<Alert, 'id'>): void {
    const alert: Alert = {
      id: uuidv4(),
      ...alertData,
    };

    // Check for duplicate alerts (within last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const isDuplicate = this.alertHistory.some(existing =>
      existing.type === alert.type &&
      existing.timestamp > fiveMinutesAgo &&
      !existing.acknowledged
    );

    if (!isDuplicate) {
      this.alertHistory.push(alert);
      this.alerts$.next(alert);
      this.emit('alert:created', alert);

      // Maintain alert history size
      if (this.alertHistory.length > 1000) {
        this.alertHistory = this.alertHistory.slice(-500);
      }
    }
  }

  private async exportMetrics(metrics: ExecutionMetrics): Promise<void> {
    if (this.config.exporters) {
      for (const exporter of this.config.exporters) {
        try {
          await this.exportToTarget(exporter, metrics);
        } catch (error) {
          console.error(`Failed to export metrics to ${exporter.type}:`, error);
        }
      }
    }
  }

  private async exportToTarget(exporter: MetricExporter, metrics: ExecutionMetrics): Promise<void> {
    switch (exporter.type) {
      case 'prometheus':
        await this.exportToPrometheus(exporter.config, metrics);
        break;
      case 'datadog':
        await this.exportToDatadog(exporter.config, metrics);
        break;
      case 'newrelic':
        await this.exportToNewRelic(exporter.config, metrics);
        break;
      case 'custom':
        await this.exportToCustom(exporter.config, metrics);
        break;
    }
  }

  private async exportToPrometheus(config: any, metrics: ExecutionMetrics): Promise<void> {
    // Implement Prometheus export
    console.log('Exporting to Prometheus:', metrics);
  }

  private async exportToDatadog(config: any, metrics: ExecutionMetrics): Promise<void> {
    // Implement Datadog export
    console.log('Exporting to Datadog:', metrics);
  }

  private async exportToNewRelic(config: any, metrics: ExecutionMetrics): Promise<void> {
    // Implement New Relic export
    console.log('Exporting to New Relic:', metrics);
  }

  private async exportToCustom(config: any, metrics: ExecutionMetrics): Promise<void> {
    // Implement custom export
    if (config.webhook) {
      const response = await fetch(config.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metrics),
      });

      if (!response.ok) {
        throw new Error(`Custom export failed: ${response.statusText}`);
      }
    }
  }

  // Public API methods

  public registerExecution(execution: ExecutionContext): void {
    this.activeExecutions.set(execution.executionId, execution);
    this.emitEvent({
      type: ExecutionEventType.EXECUTION_STARTED,
      executionId: execution.executionId,
      timestamp: new Date(),
      data: execution,
      source: 'execution_monitor',
    });
  }

  public unregisterExecution(executionId: string): void {
    this.activeExecutions.delete(executionId);
    this.emitEvent({
      type: ExecutionEventType.EXECUTION_COMPLETED,
      executionId,
      timestamp: new Date(),
      data: {},
      source: 'execution_monitor',
    });
  }

  public recordTaskExecution(taskExecution: TaskExecution): void {
    this.taskExecutions.set(taskExecution.taskId, taskExecution);

    if (taskExecution.metrics) {
      this.taskMetrics$.next(taskExecution.metrics);
    }

    this.emitEvent({
      type: ExecutionEventType.TASK_STARTED,
      executionId: taskExecution.executionId,
      timestamp: new Date(),
      data: taskExecution,
      source: 'execution_monitor',
    });
  }

  public recordCheckpoint(): void {
    this.currentMetrics.checkpointCount++;
  }

  public recordRecovery(): void {
    this.currentMetrics.recoveryCount++;
  }

  public addMetricCollector(name: string, collector: MetricCollector): void {
    this.metricCollectors.set(name, collector);
  }

  public removeMetricCollector(name: string): boolean {
    return this.metricCollectors.delete(name);
  }

  public acknowledgeAlert(alertId: string): boolean {
    const alert = this.alertHistory.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      this.emit('alert:acknowledged', alert);
      return true;
    }
    return false;
  }

  public getMetrics(): Observable<ExecutionMetrics | null> {
    return this.metrics$.asObservable();
  }

  public getAlerts(): Observable<Alert> {
    return this.alerts$.asObservable();
  }

  public getEvents(): Observable<ExecutionEvent> {
    return this.events$.asObservable();
  }

  public getTaskMetrics(): Observable<TaskMetrics> {
    return this.taskMetrics$.asObservable();
  }

  public getCurrentMetrics(): ExecutionMetrics {
    return this.currentMetrics;
  }

  public getRecentAlerts(limit: number = 50): Alert[] {
    return this.alertHistory.slice(-limit);
  }

  public getMetricHistory(metricName: string): number[] {
    return this.metricHistory.get(metricName) || [];
  }

  private emitEvent(event: ExecutionEvent): void {
    this.events$.next(event);
    this.emit('event', event);
  }

  public async shutdown(): Promise<void> {
    if (this.collectionTimer) {
      clearInterval(this.collectionTimer);
    }

    if (this.alertSubscription) {
      this.alertSubscription.unsubscribe();
    }

    this.metrics$.complete();
    this.alerts$.complete();
    this.events$.complete();
    this.taskMetrics$.complete();

    this.emit('monitor:shutdown');
  }
}

export default ExecutionMonitor;