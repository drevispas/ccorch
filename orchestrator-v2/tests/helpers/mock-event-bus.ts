import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

/**
 * Creates a mock EventBus that implements the required interface
 * for testing purposes
 */
export function createMockEventBus() {
  const emitter = new EventEmitter();
  const subscriptions = new Map<string, { handler: Function; eventType: string | string[] }>();

  return {
    emit: emitter.emit.bind(emitter),
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    removeAllListeners: emitter.removeAllListeners.bind(emitter),
    subscribe: jest.fn((eventType: string | string[], handler: Function, options?: any) => {
      const id = uuidv4();
      subscriptions.set(id, { handler, eventType });

      // Set up actual event listener for testing
      const types = Array.isArray(eventType) ? eventType : [eventType];
      types.forEach(type => {
        emitter.on(type, handler as any);
      });

      return {
        id,
        unsubscribe: jest.fn(() => {
          const sub = subscriptions.get(id);
          if (sub) {
            const types = Array.isArray(sub.eventType) ? sub.eventType : [sub.eventType];
            types.forEach(type => {
              emitter.off(type, sub.handler as any);
            });
            subscriptions.delete(id);
          }
        })
      };
    }),

    publish: jest.fn(async (event: any) => {
      emitter.emit(event.type, event);
      return Promise.resolve();
    }),

    unsubscribe: jest.fn((handlerId: string) => {
      const sub = subscriptions.get(handlerId);
      if (sub) {
        const types = Array.isArray(sub.eventType) ? sub.eventType : [sub.eventType];
        types.forEach(type => {
          emitter.off(type, sub.handler as any);
        });
        subscriptions.delete(handlerId);
      }
    }),

    getEventStream: jest.fn(() => ({
      subscribe: jest.fn()
    })),

    getEventHistory: jest.fn(() => []),

    getCorrelatedEvents: jest.fn(() => []),

    clearHistory: jest.fn(),

    getHandlerCount: jest.fn(() => subscriptions.size),

    destroy: jest.fn(() => {
      emitter.removeAllListeners();
      subscriptions.clear();
    })
  };
}