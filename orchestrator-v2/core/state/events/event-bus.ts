import { EventEmitter } from 'eventemitter3';
import { Subject, Observable, filter, map, catchError, retry, timeout, of } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';
import { StateEvent, EventMetadata, EventId, CorrelationId } from '../types';

export interface EventBusConfig {
  maxListeners?: number;
  enableLogging?: boolean;
  enableMetrics?: boolean;
  retryAttempts?: number;
  retryDelay?: number;
  eventTimeout?: number;
  bufferSize?: number;
}

export interface StateEventWithPayload<T = any> extends StateEvent {
  payload: T;
}

export interface EventHandler<T = any> {
  id: string;
  eventType: string | string[];
  handler: (event: StateEventWithPayload<T>) => void | Promise<void>;
  filter?: (event: StateEventWithPayload<T>) => boolean;
  priority?: number;
  metadata?: Record<string, any>;
}

export interface EventSubscription {
  id: string;
  unsubscribe: () => void;
}

export class EventBus {
  private emitter: EventEmitter;
  private eventSubject: Subject<StateEvent>;
  private handlers: Map<string, Set<EventHandler>>;
  private config: EventBusConfig;
  private logger: winston.Logger;
  private eventHistory: StateEvent[] = [];
  private metrics: EventBusMetrics;
  private eventStreamSubscription?: any;

  constructor(config: EventBusConfig = {}) {
    this.config = {
      maxListeners: 100,
      enableLogging: true,
      enableMetrics: true,
      retryAttempts: 3,
      retryDelay: 1000,
      eventTimeout: 30000,
      bufferSize: 1000,
      ...config
    };

    this.emitter = new EventEmitter();
    this.eventSubject = new Subject<StateEvent>();
    this.handlers = new Map();
    this.metrics = new EventBusMetrics();

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });

    this.initializeEventStream();
  }

  private initializeEventStream(): void {
    this.eventStreamSubscription = this.eventSubject
      .pipe(
        filter(event => this.shouldProcessEvent(event)),
        timeout(this.config.eventTimeout!),
        retry({ count: this.config.retryAttempts!, delay: this.config.retryDelay! }),
        catchError((error, caught) => {
          this.logger.error('Event processing error:', error);
          return of(null);
        })
      )
      .subscribe({
        next: (event) => {
          if (event) {
            this.processEvent(event);
          }
        },
        error: (error) => {
          this.logger.error('Event stream error:', error);
        }
      });
  }

  private shouldProcessEvent(event: StateEvent): boolean {
    if (!event || !event.type) {
      return false;
    }

    if (this.config.enableLogging) {
      this.logger.debug(`Processing event: ${event.type}`, {
        eventId: event.id,
        correlationId: event.correlationId
      });
    }

    return true;
  }

  private async processEvent(event: StateEvent): Promise<void> {
    const startTime = Date.now();

    try {
      this.addToHistory(event);

      const handlers = this.getHandlersForEvent(event.type);
      const sortedHandlers = Array.from(handlers).sort((a, b) =>
        (b.priority || 0) - (a.priority || 0)
      );

      for (const handler of sortedHandlers) {
        try {
          if (handler.filter && !handler.filter(event)) {
            continue;
          }

          await Promise.resolve(handler.handler(event));

          if (this.config.enableMetrics) {
            this.metrics.recordHandlerExecution(handler.id, Date.now() - startTime);
          }
        } catch (error) {
          this.logger.error(`Handler ${handler.id} failed for event ${event.type}:`, error);
          if (this.config.enableMetrics) {
            this.metrics.recordHandlerError(handler.id);
          }
        }
      }

      this.emitter.emit(event.type, event);

      if (this.config.enableMetrics) {
        this.metrics.recordEventProcessed(event.type, Date.now() - startTime);
      }
    } catch (error) {
      this.logger.error(`Failed to process event ${event.type}:`, error);
      if (this.config.enableMetrics) {
        this.metrics.recordEventError(event.type);
      }
    }
  }

  private getHandlersForEvent(eventType: string): Set<EventHandler> {
    const handlers = new Set<EventHandler>();

    for (const [type, typeHandlers] of this.handlers) {
      if (type === eventType || type === '*') {
        typeHandlers.forEach(h => handlers.add(h));
      }
    }

    return handlers;
  }

  private addToHistory(event: StateEvent): void {
    this.eventHistory.push(event);

    if (this.eventHistory.length > this.config.bufferSize!) {
      this.eventHistory.shift();
    }
  }

  public async publish(event: StateEvent): Promise<void> {
    if (!event.id) {
      event.id = uuidv4();
    }

    if (!event.timestamp) {
      event.timestamp = new Date();
    }

    if (this.config.enableLogging) {
      this.logger.info(`Publishing event: ${event.type}`, {
        eventId: event.id,
        correlationId: event.correlationId,
        metadata: event.metadata
      });
    }

    this.eventSubject.next(event);
  }

  public publishSync(event: StateEvent): void {
    if (!event.id) {
      event.id = uuidv4();
    }

    if (!event.timestamp) {
      event.timestamp = new Date();
    }

    this.processEvent(event);
  }

  public subscribe<T = any>(
    eventType: string | string[],
    handler: (event: StateEventWithPayload<T>) => void | Promise<void>,
    options?: {
      filter?: (event: StateEventWithPayload<T>) => boolean;
      priority?: number;
      metadata?: Record<string, any>;
    }
  ): EventSubscription {
    const handlerId = uuidv4();
    const eventHandler: EventHandler<T> = {
      id: handlerId,
      eventType,
      handler,
      filter: options?.filter,
      priority: options?.priority || 0,
      metadata: options?.metadata
    };

    const types = Array.isArray(eventType) ? eventType : [eventType];

    for (const type of types) {
      if (!this.handlers.has(type)) {
        this.handlers.set(type, new Set());
      }
      this.handlers.get(type)!.add(eventHandler);
    }

    if (this.config.enableLogging) {
      this.logger.debug(`Subscribed handler ${handlerId} to events: ${types.join(', ')}`);
    }

    return {
      id: handlerId,
      unsubscribe: () => this.unsubscribe(handlerId)
    };
  }

  public unsubscribe(handlerId: string): void {
    for (const [type, handlers] of this.handlers) {
      const handlersArray = Array.from(handlers);
      const handler = handlersArray.find(h => h.id === handlerId);
      if (handler) {
        handlers.delete(handler);
        if (this.config.enableLogging) {
          this.logger.debug(`Unsubscribed handler ${handlerId} from event type: ${type}`);
        }
      }
    }
  }

  public on(eventType: string, listener: (event: StateEvent) => void): void {
    this.emitter.on(eventType, listener);
  }

  public once(eventType: string, listener: (event: StateEvent) => void): void {
    this.emitter.once(eventType, listener);
  }

  public off(eventType: string, listener?: (event: StateEvent) => void): void {
    if (listener) {
      this.emitter.off(eventType, listener);
    } else {
      this.emitter.removeAllListeners(eventType);
    }
  }

  public getEventStream(): Observable<StateEvent> {
    return this.eventSubject.asObservable();
  }

  public getFilteredEventStream<T = any>(
    eventType: string | string[],
    filterFn?: (event: StateEventWithPayload<T>) => boolean
  ): Observable<StateEventWithPayload<T>> {
    const types = Array.isArray(eventType) ? eventType : [eventType];

    return this.eventSubject.asObservable().pipe(
      filter((event: StateEvent) => types.includes(event.type) || types.includes('*')),
      filter(filterFn || (() => true)),
      map(event => event as StateEventWithPayload<T>)
    );
  }

  public async waitForEvent(
    eventType: string,
    timeoutMs: number = 30000,
    filterFn?: (event: StateEvent) => boolean
  ): Promise<StateEvent> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off(eventType, handler);
        reject(new Error(`Timeout waiting for event: ${eventType}`));
      }, timeoutMs);

      const handler = (event: StateEvent) => {
        if (!filterFn || filterFn(event)) {
          clearTimeout(timer);
          this.off(eventType, handler);
          resolve(event);
        }
      };

      this.on(eventType, handler);
    });
  }

  public getEventHistory(
    filter?: {
      eventType?: string;
      correlationId?: CorrelationId;
      startTime?: Date;
      endTime?: Date;
      limit?: number;
    }
  ): StateEvent[] {
    let events = [...this.eventHistory];

    if (filter) {
      if (filter.eventType) {
        events = events.filter(e => e.type === filter.eventType);
      }
      if (filter.correlationId) {
        events = events.filter(e => e.correlationId === filter.correlationId);
      }
      if (filter.startTime) {
        events = events.filter(e => e.timestamp >= filter.startTime!);
      }
      if (filter.endTime) {
        events = events.filter(e => e.timestamp <= filter.endTime!);
      }
      if (filter.limit) {
        events = events.slice(-filter.limit);
      }
    }

    return events;
  }

  public clearEventHistory(): void {
    this.eventHistory = [];
  }

  public getMetrics(): EventBusMetricsData {
    return this.config.enableMetrics ? this.metrics.getMetrics() : {
      totalEvents: 0,
      eventCounts: {},
      handlerExecutions: {},
      handlerErrors: {},
      averageProcessingTime: 0
    };
  }

  public resetMetrics(): void {
    if (this.config.enableMetrics) {
      this.metrics.reset();
    }
  }

  public destroy(): void {
    // Unsubscribe from the event stream first
    if (this.eventStreamSubscription) {
      this.eventStreamSubscription.unsubscribe();
    }
    this.eventSubject.complete();
    this.emitter.removeAllListeners();
    this.handlers.clear();
    this.eventHistory = [];
    this.logger.info('EventBus destroyed');
  }
}

interface EventBusMetricsData {
  totalEvents: number;
  eventCounts: Record<string, number>;
  handlerExecutions: Record<string, { count: number; totalTime: number }>;
  handlerErrors: Record<string, number>;
  averageProcessingTime: number;
}

class EventBusMetrics {
  private totalEvents = 0;
  private eventCounts = new Map<string, number>();
  private handlerExecutions = new Map<string, { count: number; totalTime: number }>();
  private handlerErrors = new Map<string, number>();
  private processingTimes: number[] = [];

  recordEventProcessed(eventType: string, processingTime: number): void {
    this.totalEvents++;
    this.eventCounts.set(eventType, (this.eventCounts.get(eventType) || 0) + 1);
    this.processingTimes.push(processingTime);

    if (this.processingTimes.length > 1000) {
      this.processingTimes.shift();
    }
  }

  recordEventError(eventType: string): void {
    this.eventCounts.set(`${eventType}_error`, (this.eventCounts.get(`${eventType}_error`) || 0) + 1);
  }

  recordHandlerExecution(handlerId: string, executionTime: number): void {
    const current = this.handlerExecutions.get(handlerId) || { count: 0, totalTime: 0 };
    this.handlerExecutions.set(handlerId, {
      count: current.count + 1,
      totalTime: current.totalTime + executionTime
    });
  }

  recordHandlerError(handlerId: string): void {
    this.handlerErrors.set(handlerId, (this.handlerErrors.get(handlerId) || 0) + 1);
  }

  getMetrics(): EventBusMetricsData {
    const eventCounts: Record<string, number> = {};
    this.eventCounts.forEach((value, key) => {
      eventCounts[key] = value;
    });

    const handlerExecutions: Record<string, { count: number; totalTime: number }> = {};
    this.handlerExecutions.forEach((value, key) => {
      handlerExecutions[key] = value;
    });

    const handlerErrors: Record<string, number> = {};
    this.handlerErrors.forEach((value, key) => {
      handlerErrors[key] = value;
    });

    const averageProcessingTime = this.processingTimes.length > 0
      ? this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length
      : 0;

    return {
      totalEvents: this.totalEvents,
      eventCounts,
      handlerExecutions,
      handlerErrors,
      averageProcessingTime
    };
  }

  reset(): void {
    this.totalEvents = 0;
    this.eventCounts.clear();
    this.handlerExecutions.clear();
    this.handlerErrors.clear();
    this.processingTimes = [];
  }
}