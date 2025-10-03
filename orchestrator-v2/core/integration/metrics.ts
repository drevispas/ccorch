import { Observable, Subject, BehaviorSubject, timer } from 'rxjs';
import { map, scan, shareReplay } from 'rxjs/operators';
import { IMetricsService } from '../interfaces';

// =====================
// Metrics Types
// =====================

export interface IntegrationMetrics {
  connectionMetrics: ConnectionMetrics;
  streamingMetrics: StreamingMetrics;
  hookMetrics: HookMetrics;
  messageMetrics: MessageMetrics;
  performanceMetrics: PerformanceMetrics;
  timestamp: Date;
}

export interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  authenticatedConnections: number;
  connectionErrors: number;
  averageConnectionDuration: number;
  connectionsByType: Map<string, number>;
}

export interface StreamingMetrics {
  totalStreams: number;
  activeStreams: number;
  totalSubscriptions: number;
  activeSubscriptions: number;
  eventsStreamed: number;
  streamErrors: number;
  averageStreamLatency: number;
  throughput: number;
}

export interface HookMetrics {
  totalHooks: number;
  activeHooks: number;
  hookExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  hooksByType: Map<string, number>;
}

export interface MessageMetrics {
  messagesReceived: number;
  messagesSent: number;
  messagesQueued: number;
  messageErrors: number;
  averageMessageSize: number;
  messagesByType: Map<string, number>;
}

export interface PerformanceMetrics {
  cpuUsage: number;
  memoryUsage: number;
  eventLoopLatency: number;
  averageResponseTime: number;
  requestsPerSecond: number;
  errorRate: number;
  uptime: number;
}

// =====================
// Metrics Collector
// =====================

export class MetricsCollector implements IMetricsService {
  private metricsSubject = new BehaviorSubject<IntegrationMetrics>(this.getInitialMetrics());
  private metricUpdates = new Subject<Partial<IntegrationMetrics>>();

  public metrics$ = this.metricsSubject.asObservable().pipe(shareReplay(1));

  constructor() {
    this.setupMetricsAggregation();
    this.startMetricsCollection();
  }

  private getInitialMetrics(): IntegrationMetrics {
    return {
      connectionMetrics: {
        totalConnections: 0,
        activeConnections: 0,
        authenticatedConnections: 0,
        connectionErrors: 0,
        averageConnectionDuration: 0,
        connectionsByType: new Map(),
      },
      streamingMetrics: {
        totalStreams: 0,
        activeStreams: 0,
        totalSubscriptions: 0,
        activeSubscriptions: 0,
        eventsStreamed: 0,
        streamErrors: 0,
        averageStreamLatency: 0,
        throughput: 0,
      },
      hookMetrics: {
        totalHooks: 0,
        activeHooks: 0,
        hookExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        hooksByType: new Map(),
      },
      messageMetrics: {
        messagesReceived: 0,
        messagesSent: 0,
        messagesQueued: 0,
        messageErrors: 0,
        averageMessageSize: 0,
        messagesByType: new Map(),
      },
      performanceMetrics: {
        cpuUsage: 0,
        memoryUsage: 0,
        eventLoopLatency: 0,
        averageResponseTime: 0,
        requestsPerSecond: 0,
        errorRate: 0,
        uptime: 0,
      },
      timestamp: new Date(),
    };
  }

  private setupMetricsAggregation(): void {
    this.metricUpdates.pipe(
      scan((acc, update) => ({
        ...acc,
        ...update,
        timestamp: new Date(),
      }), this.getInitialMetrics())
    ).subscribe(metrics => {
      this.metricsSubject.next(metrics);
    });
  }

  private startMetricsCollection(): void {
    // Collect performance metrics every 5 seconds
    timer(0, 5000).subscribe(() => {
      this.collectPerformanceMetrics();
    });
  }

  private collectPerformanceMetrics(): void {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const performanceMetrics: PerformanceMetrics = {
      cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
      memoryUsage: memUsage.heapUsed / 1024 / 1024, // Convert to MB
      eventLoopLatency: 0, // To be implemented with actual measurement
      averageResponseTime: 0, // To be calculated from actual requests
      requestsPerSecond: 0, // To be calculated from actual requests
      errorRate: 0, // To be calculated from actual errors
      uptime: process.uptime(),
    };

    this.updateMetrics({ performanceMetrics });
  }

  public updateMetrics(update: Partial<IntegrationMetrics>): void {
    this.metricUpdates.next(update);
  }

  // IMetricsService implementation - renamed to avoid conflict
  public incrementCounter(name: string, tags?: Record<string, string>): void {
    // Map name to appropriate metric category
    const parts = name.split('.');
    if (parts.length >= 2) {
      const category = parts[0] as keyof IntegrationMetrics;
      const metric = parts[1];
      this.incrementMetricValue(category, metric);
    }
  }

  public recordDuration(name: string, duration: number, tags?: Record<string, string>): void {
    // Map name to appropriate metric category
    const parts = name.split('.');
    if (parts.length >= 2) {
      const category = parts[0] as keyof IntegrationMetrics;
      const metric = parts[1];
      this.recordMetricDuration(category, metric, duration);
    }
  }

  // Internal helper methods (renamed from original)
  private incrementMetricValue(
    category: keyof IntegrationMetrics,
    metric: string,
    value: number = 1
  ): void {
    const currentMetrics = this.metricsSubject.value;
    const categoryMetrics = currentMetrics[category] as any;

    if (categoryMetrics && typeof categoryMetrics[metric] === 'number') {
      categoryMetrics[metric] += value;
      this.updateMetrics({ [category]: categoryMetrics });
    }
  }

  private recordMetricDuration(
    category: keyof IntegrationMetrics,
    metric: string,
    duration: number
  ): void {
    const currentMetrics = this.metricsSubject.value;
    const categoryMetrics = currentMetrics[category] as any;

    if (categoryMetrics && metric.includes('average')) {
      // Simple moving average calculation
      const currentAverage = categoryMetrics[metric] || 0;
      const newAverage = (currentAverage + duration) / 2;
      categoryMetrics[metric] = newAverage;
      this.updateMetrics({ [category]: categoryMetrics });
    }
  }

  public getMetricsSnapshot(): IntegrationMetrics {
    return { ...this.metricsSubject.value };
  }

  public reset(): void {
    this.metricsSubject.next(this.getInitialMetrics());
  }

  // IMetricsService implementation
  public recordMetric(name: string, value: number, tags?: Record<string, string>): void {
    // Map name to appropriate metric category
    const parts = name.split('.');
    if (parts.length >= 2) {
      const category = parts[0] as keyof IntegrationMetrics;
      const metric = parts[1];
      this.incrementMetricValue(category, metric, value);
    }
  }

  public getMetric(name: string): number | undefined {
    const parts = name.split('.');
    if (parts.length >= 2) {
      const category = parts[0] as keyof IntegrationMetrics;
      const metric = parts[1];
      const categoryMetrics = this.metricsSubject.value[category] as any;
      return categoryMetrics?.[metric];
    }
    return undefined;
  }

  public getAllMetrics(): Record<string, number> {
    const result: Record<string, number> = {};
    const metrics = this.metricsSubject.value;

    // Flatten all metrics into a single object
    Object.entries(metrics).forEach(([category, categoryMetrics]) => {
      if (typeof categoryMetrics === 'object' && categoryMetrics !== null && !(categoryMetrics instanceof Date)) {
        Object.entries(categoryMetrics).forEach(([key, value]) => {
          if (typeof value === 'number') {
            result[`${category}.${key}`] = value;
          }
        });
      }
    });

    return result;
  }

  public async exportMetrics(): Promise<void> {
    // Export metrics to external system (to be implemented based on requirements)
    const metrics = this.getAllMetrics();
    console.log('Exporting metrics:', metrics);
  }
}

// =====================
// Metrics Exporter
// =====================

export class MetricsExporter {
  constructor(private collector: MetricsCollector) {}

  public exportPrometheusFormat(): string {
    const metrics = this.collector.getMetricsSnapshot();
    const lines: string[] = [];

    // Connection metrics
    lines.push(`# TYPE integration_connections_total counter`);
    lines.push(`integration_connections_total ${metrics.connectionMetrics.totalConnections}`);
    lines.push(`# TYPE integration_connections_active gauge`);
    lines.push(`integration_connections_active ${metrics.connectionMetrics.activeConnections}`);

    // Streaming metrics
    lines.push(`# TYPE integration_streams_total counter`);
    lines.push(`integration_streams_total ${metrics.streamingMetrics.totalStreams}`);
    lines.push(`# TYPE integration_events_streamed_total counter`);
    lines.push(`integration_events_streamed_total ${metrics.streamingMetrics.eventsStreamed}`);

    // Hook metrics
    lines.push(`# TYPE integration_hooks_executed_total counter`);
    lines.push(`integration_hooks_executed_total ${metrics.hookMetrics.hookExecutions}`);
    lines.push(`# TYPE integration_hooks_success_total counter`);
    lines.push(`integration_hooks_success_total ${metrics.hookMetrics.successfulExecutions}`);

    // Message metrics
    lines.push(`# TYPE integration_messages_received_total counter`);
    lines.push(`integration_messages_received_total ${metrics.messageMetrics.messagesReceived}`);
    lines.push(`# TYPE integration_messages_sent_total counter`);
    lines.push(`integration_messages_sent_total ${metrics.messageMetrics.messagesSent}`);

    // Performance metrics
    lines.push(`# TYPE integration_cpu_usage_seconds gauge`);
    lines.push(`integration_cpu_usage_seconds ${metrics.performanceMetrics.cpuUsage}`);
    lines.push(`# TYPE integration_memory_usage_megabytes gauge`);
    lines.push(`integration_memory_usage_megabytes ${metrics.performanceMetrics.memoryUsage}`);
    lines.push(`# TYPE integration_uptime_seconds gauge`);
    lines.push(`integration_uptime_seconds ${metrics.performanceMetrics.uptime}`);

    return lines.join('\n');
  }

  public exportJSON(): string {
    return JSON.stringify(this.collector.getMetricsSnapshot(), null, 2);
  }
}

// =====================
// Default exports
// =====================

export default {
  MetricsCollector,
  MetricsExporter,
};