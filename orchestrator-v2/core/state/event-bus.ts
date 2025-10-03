import { EventEmitter } from 'events';
import { StateEvent, EventId, CorrelationId, EventMetadata } from './types';
import { v4 as uuidv4 } from 'uuid';

export type EventHandler = (event: StateEvent) => void | Promise<void>;
export type EventFilter = (event: StateEvent) => boolean;

export interface Subscription {
  id: string;
  eventType: string;
  handler: EventHandler;
  filter?: EventFilter;
  once?: boolean;
}

export class EventBus extends EventEmitter {
  private subscriptions: Map<string, Subscription> = new Map();
  private eventHistory: StateEvent[] = [];
  private maxHistorySize: number = 1000;
  private correlationMap: Map<CorrelationId, EventId[]> = new Map();

  constructor(options?: { maxHistorySize?: number; maxListeners?: number }) {
    super();
    if (options?.maxHistorySize) {
      this.maxHistorySize = options.maxHistorySize;
    }
    if (options?.maxListeners) {
      this.setMaxListeners(options.maxListeners);
    }
  }

  subscribe(
    eventType: string,
    handler: EventHandler,
    options?: {
      filter?: EventFilter;
      once?: boolean;
    }
  ): string {
    const subscriptionId = uuidv4();
    const subscription: Subscription = {
      id: subscriptionId,
      eventType,
      handler,
      filter: options?.filter,
      once: options?.once,
    };

    this.subscriptions.set(subscriptionId, subscription);

    const wrappedHandler = async (event: StateEvent) => {
      if (subscription.filter && !subscription.filter(event)) {
        return;
      }

      try {
        await handler(event);
      } catch (error) {
        console.error(`Error in event handler for ${eventType}:`, error);
        this.emit('handler-error', { error, event, subscription });
      }

      if (subscription.once) {
        this.unsubscribe(subscriptionId);
      }
    };

    if (options?.once) {
      this.once(eventType, wrappedHandler);
    } else {
      this.on(eventType, wrappedHandler);
    }

    return subscriptionId;
  }

  unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return;
    }

    this.removeAllListeners(subscription.eventType);
    this.subscriptions.delete(subscriptionId);
  }

  async publish(event: StateEvent): Promise<void> {
    // Add to history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Track correlation
    if (event.metadata.correlationId) {
      const existingEvents = this.correlationMap.get(event.metadata.correlationId) || [];
      existingEvents.push(event.id);
      this.correlationMap.set(event.metadata.correlationId, existingEvents);
    }

    // Emit event
    this.emit(event.type, event);
    this.emit('*', event); // Global event listener
  }

  async publishBatch(events: StateEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  getEventHistory(options?: {
    eventType?: string;
    correlationId?: CorrelationId;
    limit?: number;
  }): StateEvent[] {
    let history = [...this.eventHistory];

    if (options?.eventType) {
      history = history.filter(e => e.type === options.eventType);
    }

    if (options?.correlationId) {
      const eventIds = this.correlationMap.get(options.correlationId) || [];
      history = history.filter(e => eventIds.includes(e.id));
    }

    if (options?.limit && options.limit > 0) {
      history = history.slice(-options.limit);
    }

    return history;
  }

  getCorrelatedEvents(correlationId: CorrelationId): StateEvent[] {
    const eventIds = this.correlationMap.get(correlationId) || [];
    return this.eventHistory.filter(e => eventIds.includes(e.id));
  }

  clearHistory(): void {
    this.eventHistory = [];
    this.correlationMap.clear();
  }

  getSubscriptions(): Subscription[] {
    return Array.from(this.subscriptions.values());
  }

  hasSubscribers(eventType: string): boolean {
    return this.listenerCount(eventType) > 0;
  }

  reset(): void {
    this.removeAllListeners();
    this.subscriptions.clear();
    this.clearHistory();
  }

  createEvent(
    type: string,
    payload: any,
    metadata: Partial<EventMetadata> = {}
  ): StateEvent {
    return {
      id: uuidv4(),
      correlationId: metadata.correlationId || uuidv4(),
      type,
      payload,
      metadata: {
        source: 'orchestrator',
        version: '2.0.0',
        ...metadata,
      } as EventMetadata,
      timestamp: new Date(),
    };
  }

  async waitFor(
    eventType: string,
    options?: {
      timeout?: number;
      filter?: EventFilter;
    }
  ): Promise<StateEvent> {
    return new Promise((resolve, reject) => {
      const timeoutId = options?.timeout
        ? setTimeout(() => {
            this.unsubscribe(subscriptionId);
            reject(new Error(`Timeout waiting for event: ${eventType}`));
          }, options.timeout)
        : null;

      const subscriptionId = this.subscribe(
        eventType,
        (event) => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          resolve(event);
        },
        {
          filter: options?.filter,
          once: true,
        }
      );
    });
  }
}