import { EventEmitter } from 'events';
import { Observable, Subject, BehaviorSubject, interval, merge } from 'rxjs';
import { map, scan, throttleTime, buffer, bufferTime, takeUntil, filter } from 'rxjs/operators';

export interface ServerMetrics {
  // Connection metrics
  totalConnections: number;
  activeConnections: number;
  authenticatedConnections: number;
  failedConnections: number;
  averageConnectionDuration: number;

  // Message metrics
  messagesReceived: number;
  messagesSent: number;
  messagesDropped: number;
  averageMessageSize: number;
  averageProcessingTime: number;

  // Performance metrics
  throughput: number; // messages per second
  latency: number;
  peakConnections: number;
  peakThroughput: number;

  // Error metrics
  errorsCount: number;
  errorRate: number;
  lastError?: string;

  // System metrics
  uptime: number;
  memoryUsage: number;
  cpuUsage: number;
  startTime: Date;
}

export interface MetricSnapshot {
  timestamp: Date;
  metrics: ServerMetrics;
  period: 'instant' | 'minute' | 'hour' | 'day';
}

export interface MetricEvent {
  type: string;
  value: number;
  metadata?: any;
  timestamp: Date;
}

export class MetricsCollector extends EventEmitter {
  private metrics: ServerMetrics;
  private historicalMetrics: MetricSnapshot[] = [];
  private metricsInterval?: NodeJS.Timeout;

  // Observable streams
  private metricEventSubject = new Subject<MetricEvent>();
  private metricsSubject = new BehaviorSubject<ServerMetrics>(this.getInitialMetrics());
  private destroy$ = new Subject<void>();

  public metricEvents$ = this.metricEventSubject.asObservable();
  public metrics$ = this.metricsSubject.asObservable();

  // Aggregation streams
  public throughput$ = this.createThroughputStream();
  public errorRate$ = this.createErrorRateStream();
  public averages$ = this.createAveragesStream();

  // Configuration
  private config = {
    collectionInterval: 60000, // 1 minute
    historySize: 1440, // 24 hours of minute snapshots
    aggregationWindow: 5000, // 5 seconds for real-time metrics
  };

  constructor(config?: Partial<typeof MetricsCollector.prototype.config>) {
    super();
    this.config = { ...this.config, ...config };
    this.metrics = this.getInitialMetrics();
  }

  /**
   * Start collecting metrics
   */
  public start(): void {
    if (this.metricsInterval) {
      return; // Already started
    }

    // Setup periodic collection
    this.metricsInterval = setInterval(() => {
      this.collectSnapshot();
    }, this.config.collectionInterval);

    // Setup real-time aggregation
    this.setupRealtimeAggregation();

    // Start system metrics collection
    this.startSystemMetricsCollection();
  }

  /**
   * Stop collecting metrics
   */
  public stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }

    this.destroy$.next();
    this.destroy$.complete();
    this.metricEventSubject.complete();
    this.metricsSubject.complete();

    this.removeAllListeners();
  }

  /**
   * Record a connection event
   */
  public recordConnection(type: 'new' | 'authenticated' | 'failed' | 'closed'): void {
    switch (type) {
      case 'new':
        this.metrics.totalConnections++;
        this.metrics.activeConnections++;
        if (this.metrics.activeConnections > this.metrics.peakConnections) {
          this.metrics.peakConnections = this.metrics.activeConnections;
        }
        break;
      case 'authenticated':
        this.metrics.authenticatedConnections++;
        break;
      case 'failed':
        this.metrics.failedConnections++;
        break;
      case 'closed':
        this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections - 1);
        if (this.metrics.authenticatedConnections > 0) {
          this.metrics.authenticatedConnections--;
        }
        break;
    }

    this.emitMetricEvent('connection.' + type, 1);
    this.updateMetrics();
  }

  /**
   * Record a message event
   */
  public recordMessage(
    type: 'received' | 'sent' | 'dropped',
    size?: number,
    processingTime?: number
  ): void {
    switch (type) {
      case 'received':
        this.metrics.messagesReceived++;
        break;
      case 'sent':
        this.metrics.messagesSent++;
        break;
      case 'dropped':
        this.metrics.messagesDropped++;
        break;
    }

    if (size !== undefined) {
      this.updateAverageMessageSize(size);
    }

    if (processingTime !== undefined) {
      this.updateAverageProcessingTime(processingTime);
    }

    this.emitMetricEvent('message.' + type, 1, { size, processingTime });
    this.updateMetrics();
  }

  /**
   * Record an error
   */
  public recordError(error: string | Error): void {
    this.metrics.errorsCount++;
    this.metrics.lastError = error instanceof Error ? error.message : error;

    this.emitMetricEvent('error', 1, { error: this.metrics.lastError });
    this.updateMetrics();
  }

  /**
   * Update connection duration
   */
  public updateConnectionDuration(duration: number): void {
    const currentAvg = this.metrics.averageConnectionDuration;
    const totalConnections = this.metrics.totalConnections;

    if (totalConnections > 0) {
      this.metrics.averageConnectionDuration =
        (currentAvg * (totalConnections - 1) + duration) / totalConnections;
    }

    this.updateMetrics();
  }

  /**
   * Get current metrics
   */
  public getMetrics(): ServerMetrics {
    return { ...this.metrics };
  }

  /**
   * Get historical metrics
   */
  public getHistoricalMetrics(
    period?: 'minute' | 'hour' | 'day',
    limit?: number
  ): MetricSnapshot[] {
    let filtered = this.historicalMetrics;

    if (period) {
      filtered = filtered.filter(snapshot => snapshot.period === period);
    }

    if (limit) {
      filtered = filtered.slice(-limit);
    }

    return filtered;
  }

  /**
   * Get aggregated metrics for a time range
   */
  public getAggregatedMetrics(
    startTime: Date,
    endTime: Date
  ): Partial<ServerMetrics> {
    const snapshots = this.historicalMetrics.filter(
      snapshot =>
        snapshot.timestamp >= startTime && snapshot.timestamp <= endTime
    );

    if (snapshots.length === 0) {
      return {};
    }

    // Calculate aggregates
    const aggregated: Partial<ServerMetrics> = {
      totalConnections: 0,
      messagesReceived: 0,
      messagesSent: 0,
      errorsCount: 0,
      peakConnections: 0,
      peakThroughput: 0,
    };

    snapshots.forEach(snapshot => {
      aggregated.totalConnections! += snapshot.metrics.totalConnections;
      aggregated.messagesReceived! += snapshot.metrics.messagesReceived;
      aggregated.messagesSent! += snapshot.metrics.messagesSent;
      aggregated.errorsCount! += snapshot.metrics.errorsCount;

      if (snapshot.metrics.peakConnections > aggregated.peakConnections!) {
        aggregated.peakConnections = snapshot.metrics.peakConnections;
      }

      if (snapshot.metrics.peakThroughput > aggregated.peakThroughput!) {
        aggregated.peakThroughput = snapshot.metrics.peakThroughput;
      }
    });

    return aggregated;
  }

  /**
   * Reset metrics
   */
  public reset(): void {
    this.metrics = this.getInitialMetrics();
    this.historicalMetrics = [];
    this.updateMetrics();
  }

  // Private methods

  private getInitialMetrics(): ServerMetrics {
    return {
      totalConnections: 0,
      activeConnections: 0,
      authenticatedConnections: 0,
      failedConnections: 0,
      averageConnectionDuration: 0,
      messagesReceived: 0,
      messagesSent: 0,
      messagesDropped: 0,
      averageMessageSize: 0,
      averageProcessingTime: 0,
      throughput: 0,
      latency: 0,
      peakConnections: 0,
      peakThroughput: 0,
      errorsCount: 0,
      errorRate: 0,
      uptime: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      startTime: new Date(),
    };
  }

  private updateMetrics(): void {
    // Update uptime
    this.metrics.uptime = Date.now() - this.metrics.startTime.getTime();

    // Update throughput (messages per second)
    const uptimeSeconds = this.metrics.uptime / 1000;
    if (uptimeSeconds > 0) {
      const currentThroughput =
        (this.metrics.messagesReceived + this.metrics.messagesSent) / uptimeSeconds;
      this.metrics.throughput = currentThroughput;

      if (currentThroughput > this.metrics.peakThroughput) {
        this.metrics.peakThroughput = currentThroughput;
      }
    }

    // Update error rate
    const totalMessages = this.metrics.messagesReceived + this.metrics.messagesSent;
    if (totalMessages > 0) {
      this.metrics.errorRate = this.metrics.errorsCount / totalMessages;
    }

    // Emit updated metrics
    this.metricsSubject.next({ ...this.metrics });
  }

  private collectSnapshot(): void {
    const snapshot: MetricSnapshot = {
      timestamp: new Date(),
      metrics: { ...this.metrics },
      period: 'minute',
    };

    this.historicalMetrics.push(snapshot);

    // Maintain history size
    if (this.historicalMetrics.length > this.config.historySize) {
      this.historicalMetrics.shift();
    }

    // Emit snapshot event
    this.emit('snapshot', snapshot);
  }

  private setupRealtimeAggregation(): void {
    // Aggregate metric events over time windows
    this.metricEventSubject
      .pipe(
        bufferTime(this.config.aggregationWindow),
        takeUntil(this.destroy$)
      )
      .subscribe(events => {
        if (events.length > 0) {
          this.processAggregatedEvents(events);
        }
      });
  }

  private processAggregatedEvents(events: MetricEvent[]): void {
    // Process aggregated events for real-time metrics
    const messageEvents = events.filter(e => e.type.startsWith('message.'));
    const errorEvents = events.filter(e => e.type === 'error');

    // Calculate real-time throughput
    if (messageEvents.length > 0) {
      const windowSeconds = this.config.aggregationWindow / 1000;
      const realtimeThroughput = messageEvents.length / windowSeconds;
      this.metrics.throughput = realtimeThroughput;
    }

    // Calculate real-time error rate
    if (events.length > 0) {
      const realtimeErrorRate = errorEvents.length / events.length;
      this.metrics.errorRate = realtimeErrorRate;
    }
  }

  private createThroughputStream(): Observable<number> {
    return this.metricEventSubject.pipe(
      filter(event => event.type.startsWith('message.')),
      bufferTime(1000), // 1 second windows
      map(events => events.length),
      takeUntil(this.destroy$)
    );
  }

  private createErrorRateStream(): Observable<number> {
    return this.metricEventSubject.pipe(
      bufferTime(5000), // 5 second windows
      map(events => {
        const errors = events.filter(e => e.type === 'error').length;
        return events.length > 0 ? errors / events.length : 0;
      }),
      takeUntil(this.destroy$)
    );
  }

  private createAveragesStream(): Observable<{
    messageSize: number;
    processingTime: number;
  }> {
    return this.metricEventSubject.pipe(
      filter(event => event.metadata?.size !== undefined || event.metadata?.processingTime !== undefined),
      bufferTime(10000), // 10 second windows
      map(events => {
        let totalSize = 0;
        let sizeCount = 0;
        let totalProcessing = 0;
        let processingCount = 0;

        events.forEach(event => {
          if (event.metadata?.size !== undefined) {
            totalSize += event.metadata.size;
            sizeCount++;
          }
          if (event.metadata?.processingTime !== undefined) {
            totalProcessing += event.metadata.processingTime;
            processingCount++;
          }
        });

        return {
          messageSize: sizeCount > 0 ? totalSize / sizeCount : 0,
          processingTime: processingCount > 0 ? totalProcessing / processingCount : 0,
        };
      }),
      takeUntil(this.destroy$)
    );
  }

  private startSystemMetricsCollection(): void {
    interval(5000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        // Update system metrics
        const memUsage = process.memoryUsage();
        this.metrics.memoryUsage = memUsage.heapUsed / 1024 / 1024; // MB

        // CPU usage would require more complex calculation
        // For now, we'll leave it as a placeholder
        this.metrics.cpuUsage = 0;

        this.updateMetrics();
      });
  }

  private updateAverageMessageSize(size: number): void {
    const totalMessages = this.metrics.messagesReceived + this.metrics.messagesSent;
    if (totalMessages > 0) {
      this.metrics.averageMessageSize =
        (this.metrics.averageMessageSize * (totalMessages - 1) + size) / totalMessages;
    }
  }

  private updateAverageProcessingTime(processingTime: number): void {
    const totalMessages = this.metrics.messagesReceived;
    if (totalMessages > 0) {
      this.metrics.averageProcessingTime =
        (this.metrics.averageProcessingTime * (totalMessages - 1) + processingTime) /
        totalMessages;
    }
  }

  private emitMetricEvent(type: string, value: number, metadata?: any): void {
    this.metricEventSubject.next({
      type,
      value,
      metadata,
      timestamp: new Date(),
    });
  }
}