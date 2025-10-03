import { v4 as uuidv4 } from 'uuid';
import { EventBus } from '../../core/state/events/event-bus';
import { StateEvent } from '../../core/state/types';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus({
      enableLogging: false,
      enableMetrics: true
    });
  });

  afterEach(async () => {
    await eventBus.destroy();
  });

  describe('Event Publishing', () => {
    it('should publish and handle events', (done) => {
      const event: StateEvent = {
        id: uuidv4(),
        correlationId: uuidv4(),
        type: 'TestEvent',
        payload: { data: 'test' },
        metadata: {
          source: 'test',
          version: '1.0.0'
        },
        timestamp: new Date()
      };

      eventBus.subscribe('TestEvent', (receivedEvent) => {
        expect(receivedEvent.id).toBe(event.id);
        expect(receivedEvent.payload).toEqual(event.payload);
        done();
      });

      eventBus.publish(event);
    });

    it('should handle multiple subscribers', async () => {
      const event: StateEvent = {
        id: uuidv4(),
        correlationId: uuidv4(),
        type: 'MultiSubscriberEvent',
        payload: { count: 0 },
        metadata: {
          source: 'test',
          version: '1.0.0'
        },
        timestamp: new Date()
      };

      let counter = 0;

      eventBus.subscribe('MultiSubscriberEvent', () => {
        counter++;
      });

      eventBus.subscribe('MultiSubscriberEvent', () => {
        counter++;
      });

      eventBus.subscribe('MultiSubscriberEvent', () => {
        counter++;
      });

      await eventBus.publish(event);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(counter).toBe(3);
    });

    it('should support wildcard subscriptions', (done) => {
      const event: StateEvent = {
        id: uuidv4(),
        correlationId: uuidv4(),
        type: 'WildcardTest',
        payload: {},
        metadata: {
          source: 'test',
          version: '1.0.0'
        },
        timestamp: new Date()
      };

      eventBus.subscribe('*', (receivedEvent) => {
        expect(receivedEvent.type).toBe('WildcardTest');
        done();
      });

      eventBus.publish(event);
    });

    it('should filter events', async () => {
      let receivedEvents = 0;

      eventBus.subscribe('FilteredEvent',
        () => {
          receivedEvents++;
        },
        {
          filter: (event) => event.payload.value > 5
        }
      );

      await eventBus.publish({
        id: uuidv4(),
        correlationId: uuidv4(),
        type: 'FilteredEvent',
        payload: { value: 3 },
        metadata: { source: 'test', version: '1.0.0' },
        timestamp: new Date()
      });

      await eventBus.publish({
        id: uuidv4(),
        correlationId: uuidv4(),
        type: 'FilteredEvent',
        payload: { value: 10 },
        metadata: { source: 'test', version: '1.0.0' },
        timestamp: new Date()
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedEvents).toBe(1);
    });

    it('should handle priority-based execution', async () => {
      const executionOrder: number[] = [];

      eventBus.subscribe('PriorityEvent',
        () => { executionOrder.push(1); },
        { priority: 1 }
      );

      eventBus.subscribe('PriorityEvent',
        () => { executionOrder.push(3); },
        { priority: 3 }
      );

      eventBus.subscribe('PriorityEvent',
        () => { executionOrder.push(2); },
        { priority: 2 }
      );

      await eventBus.publish({
        id: uuidv4(),
        correlationId: uuidv4(),
        type: 'PriorityEvent',
        payload: {},
        metadata: { source: 'test', version: '1.0.0' },
        timestamp: new Date()
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(executionOrder).toEqual([3, 2, 1]);
    });
  });

  describe('Event Streams', () => {
    it('should provide observable event stream', (done) => {
      const subscription = eventBus.getEventStream().subscribe({
        next: (event) => {
          expect(event.type).toBe('StreamEvent');
          subscription.unsubscribe();
          done();
        }
      });

      eventBus.publish({
        id: uuidv4(),
        correlationId: uuidv4(),
        type: 'StreamEvent',
        payload: {},
        metadata: { source: 'test', version: '1.0.0' },
        timestamp: new Date()
      });
    });

    it('should provide filtered event stream', (done) => {
      const subscription = eventBus
        .getFilteredEventStream('FilteredStreamEvent', (event) => event.payload.valid === true)
        .subscribe({
          next: (event) => {
            expect(event.payload.valid).toBe(true);
            subscription.unsubscribe();
            done();
          }
        });

      eventBus.publish({
        id: uuidv4(),
        correlationId: uuidv4(),
        type: 'FilteredStreamEvent',
        payload: { valid: false },
        metadata: { source: 'test', version: '1.0.0' },
        timestamp: new Date()
      });

      eventBus.publish({
        id: uuidv4(),
        correlationId: uuidv4(),
        type: 'FilteredStreamEvent',
        payload: { valid: true },
        metadata: { source: 'test', version: '1.0.0' },
        timestamp: new Date()
      });
    });
  });

  describe('Event Waiting', () => {
    it('should wait for specific event', async () => {
      const eventId = uuidv4();

      setTimeout(() => {
        eventBus.publish({
          id: eventId,
          correlationId: uuidv4(),
          type: 'WaitEvent',
          payload: { success: true },
          metadata: { source: 'test', version: '1.0.0' },
          timestamp: new Date()
        });
      }, 50);

      const event = await eventBus.waitForEvent('WaitEvent', 1000);

      expect(event).toBeDefined();
      expect(event.type).toBe('WaitEvent');
      expect(event.payload.success).toBe(true);
    });

    it('should timeout when waiting for event', async () => {
      await expect(
        eventBus.waitForEvent('NonExistentEvent', 100)
      ).rejects.toThrow('Timeout waiting for event: NonExistentEvent');
    });

    it('should wait for event with filter', async () => {
      setTimeout(() => {
        eventBus.publish({
          id: uuidv4(),
          correlationId: uuidv4(),
          type: 'FilteredWaitEvent',
          payload: { value: 5 },
          metadata: { source: 'test', version: '1.0.0' },
          timestamp: new Date()
        });

        eventBus.publish({
          id: uuidv4(),
          correlationId: uuidv4(),
          type: 'FilteredWaitEvent',
          payload: { value: 10 },
          metadata: { source: 'test', version: '1.0.0' },
          timestamp: new Date()
        });
      }, 50);

      const event = await eventBus.waitForEvent(
        'FilteredWaitEvent',
        1000,
        (e) => e.payload.value === 10
      );

      expect(event.payload.value).toBe(10);
    });
  });

  describe('Event History', () => {
    beforeEach(async () => {
      const correlationId = uuidv4();

      for (let i = 0; i < 5; i++) {
        await eventBus.publish({
          id: uuidv4(),
          correlationId,
          type: `Event${i % 2}`,
          payload: { index: i },
          metadata: { source: 'test', version: '1.0.0' },
          timestamp: new Date(Date.now() + i * 1000)
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should retrieve event history', () => {
      const history = eventBus.getEventHistory();
      expect(history).toHaveLength(5);
    });

    it('should filter event history by type', () => {
      const history = eventBus.getEventHistory({ eventType: 'Event0' });
      expect(history).toHaveLength(3);
      expect(history.every(e => e.type === 'Event0')).toBe(true);
    });

    it('should filter event history by correlation ID', () => {
      const correlationId = uuidv4();

      eventBus.publishSync({
        id: uuidv4(),
        correlationId,
        type: 'CorrelatedEvent',
        payload: {},
        metadata: { source: 'test', version: '1.0.0' },
        timestamp: new Date()
      });

      const history = eventBus.getEventHistory({ correlationId });
      expect(history).toHaveLength(1);
      expect(history[0].correlationId).toBe(correlationId);
    });

    it('should limit event history', () => {
      const history = eventBus.getEventHistory({ limit: 2 });
      expect(history).toHaveLength(2);
    });

    it('should clear event history', () => {
      eventBus.clearEventHistory();
      const history = eventBus.getEventHistory();
      expect(history).toHaveLength(0);
    });
  });

  describe('Subscription Management', () => {
    it('should unsubscribe handler', async () => {
      let counter = 0;

      const subscription = eventBus.subscribe('UnsubscribeEvent', () => {
        counter++;
      });

      await eventBus.publish({
        id: uuidv4(),
        correlationId: uuidv4(),
        type: 'UnsubscribeEvent',
        payload: {},
        metadata: { source: 'test', version: '1.0.0' },
        timestamp: new Date()
      });

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(counter).toBe(1);

      subscription.unsubscribe();

      await eventBus.publish({
        id: uuidv4(),
        correlationId: uuidv4(),
        type: 'UnsubscribeEvent',
        payload: {},
        metadata: { source: 'test', version: '1.0.0' },
        timestamp: new Date()
      });

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(counter).toBe(1);
    });

    it('should handle one-time listeners', (done) => {
      let counter = 0;

      eventBus.once('OnceEvent', () => {
        counter++;

        setTimeout(() => {
          expect(counter).toBe(1);
          done();
        }, 100);
      });

      eventBus.publishSync({
        id: uuidv4(),
        correlationId: uuidv4(),
        type: 'OnceEvent',
        payload: {},
        metadata: { source: 'test', version: '1.0.0' },
        timestamp: new Date()
      });

      eventBus.publishSync({
        id: uuidv4(),
        correlationId: uuidv4(),
        type: 'OnceEvent',
        payload: {},
        metadata: { source: 'test', version: '1.0.0' },
        timestamp: new Date()
      });
    });

    it('should remove all listeners for event type', async () => {
      let counter = 0;

      eventBus.on('RemoveAllEvent', () => counter++);
      eventBus.on('RemoveAllEvent', () => counter++);
      eventBus.on('RemoveAllEvent', () => counter++);

      await eventBus.publish({
        id: uuidv4(),
        correlationId: uuidv4(),
        type: 'RemoveAllEvent',
        payload: {},
        metadata: { source: 'test', version: '1.0.0' },
        timestamp: new Date()
      });

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(counter).toBe(3);

      eventBus.off('RemoveAllEvent');

      await eventBus.publish({
        id: uuidv4(),
        correlationId: uuidv4(),
        type: 'RemoveAllEvent',
        payload: {},
        metadata: { source: 'test', version: '1.0.0' },
        timestamp: new Date()
      });

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(counter).toBe(3);
    });
  });

  describe('Metrics', () => {
    it('should track event metrics', async () => {
      for (let i = 0; i < 10; i++) {
        await eventBus.publish({
          id: uuidv4(),
          correlationId: uuidv4(),
          type: `MetricEvent${i % 3}`,
          payload: { index: i },
          metadata: { source: 'test', version: '1.0.0' },
          timestamp: new Date()
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const metrics = eventBus.getMetrics();

      expect(metrics.totalEvents).toBeGreaterThanOrEqual(10);
      expect(metrics.eventCounts['MetricEvent0']).toBe(4);
      expect(metrics.eventCounts['MetricEvent1']).toBe(3);
      expect(metrics.eventCounts['MetricEvent2']).toBe(3);
      expect(metrics.averageProcessingTime).toBeGreaterThanOrEqual(0);
    });

    it('should track handler errors', async () => {
      eventBus.subscribe('ErrorEvent', () => {
        throw new Error('Handler error');
      });

      await eventBus.publish({
        id: uuidv4(),
        correlationId: uuidv4(),
        type: 'ErrorEvent',
        payload: {},
        metadata: { source: 'test', version: '1.0.0' },
        timestamp: new Date()
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const metrics = eventBus.getMetrics();
      expect(Object.values(metrics.handlerErrors).some(count => count > 0)).toBe(true);
    });

    it('should reset metrics', async () => {
      await eventBus.publish({
        id: uuidv4(),
        correlationId: uuidv4(),
        type: 'ResetMetricEvent',
        payload: {},
        metadata: { source: 'test', version: '1.0.0' },
        timestamp: new Date()
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      let metrics = eventBus.getMetrics();
      expect(metrics.totalEvents).toBeGreaterThan(0);

      eventBus.resetMetrics();

      metrics = eventBus.getMetrics();
      expect(metrics.totalEvents).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle synchronous handler errors', async () => {
      const errorHandler = jest.fn(() => {
        throw new Error('Sync error');
      });

      const successHandler = jest.fn();

      eventBus.subscribe('ErrorHandlingEvent', errorHandler);
      eventBus.subscribe('ErrorHandlingEvent', successHandler);

      await eventBus.publish({
        id: uuidv4(),
        correlationId: uuidv4(),
        type: 'ErrorHandlingEvent',
        payload: {},
        metadata: { source: 'test', version: '1.0.0' },
        timestamp: new Date()
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(errorHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
    });

    it('should handle asynchronous handler errors', async () => {
      const errorHandler = jest.fn(async () => {
        throw new Error('Async error');
      });

      const successHandler = jest.fn();

      eventBus.subscribe('AsyncErrorEvent', errorHandler);
      eventBus.subscribe('AsyncErrorEvent', successHandler);

      await eventBus.publish({
        id: uuidv4(),
        correlationId: uuidv4(),
        type: 'AsyncErrorEvent',
        payload: {},
        metadata: { source: 'test', version: '1.0.0' },
        timestamp: new Date()
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(errorHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
    });
  });
});