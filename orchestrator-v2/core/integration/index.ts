/**
 * Integration Layer - Session 6
 *
 * This module provides real-time bidirectional communication between Claude Code
 * and the orchestrator engine through WebSocket server and streaming support.
 *
 * Key Features:
 * - WebSocket server for real-time communication
 * - Streaming bridge connecting RxJS observables to WebSocket streams
 * - Hook versioning and compatibility system
 * - Message protocol handling
 * - Integration with all Phase 1 and Phase 2 components
 */

// Core types
export * from './types';

// Main components
export { IntegrationWebSocketServer } from './websocket-server';
export { StreamingBridge } from './streaming-bridge';
export { HookManager } from './hook-manager';
export { MessageProtocolHandler } from './protocol-handler';

// New refactored managers
export { ConnectionManager } from './connection-manager';
export { MessageRouter } from './message-router';
export { HeartbeatManager } from './heartbeat-manager';
export { MetricsCollector } from './metrics-collector';

// Integration Layer orchestrator
export { IntegrationLayer } from './integration-layer';

// Utilities and helpers
export { IntegrationUtils } from './utils';
export { MetricsExporter } from './metrics';

// Configuration defaults
export const DEFAULT_INTEGRATION_CONFIG = {
  websocket: {
    port: 3002,
    host: '0.0.0.0',
    path: '/ws',
    maxConnections: 100,
    maxStreamsPerConnection: 10,
    heartbeatInterval: 30000,
    connectionTimeout: 10000,
    messageTimeout: 5000,
    maxMessageSize: 1024 * 1024, // 1MB
    compression: true,
    authentication: {
      enabled: false,
      providers: ['none'],
    },
    rateLimit: {
      enabled: true,
      maxRequestsPerMinute: 100,
      burstLimit: 20,
    },
  },
  streaming: {
    bufferSize: 100,
    backpressureThreshold: 1000,
    retryAttempts: 3,
    retryDelay: 1000,
  },
  hooks: {
    maxConcurrentExecutions: 10,
    executionTimeout: 30000,
    registrySize: 100,
    versioningEnabled: true,
  },
  monitoring: {
    metricsEnabled: true,
    loggingLevel: 'info' as const,
    performanceTracking: true,
  },
};

// Integration Layer feature flags
export const INTEGRATION_FEATURES = {
  WEBSOCKET_STREAMING: 'websocket_streaming',
  HOOK_VERSIONING: 'hook_versioning',
  REAL_TIME_METRICS: 'real_time_metrics',
  BIDIRECTIONAL_CONTROL: 'bidirectional_control',
  CIRCUIT_BREAKER: 'circuit_breaker',
  COMPRESSION: 'compression',
  AUTHENTICATION: 'authentication',
  RATE_LIMITING: 'rate_limiting',
} as const;

// Supported hook versions
export const SUPPORTED_HOOK_VERSIONS = ['1.0.0', '2.0.0'] as const;

// Message protocol version
export const PROTOCOL_VERSION = '2.0.0';

// Re-export commonly used types for convenience
export {
  IntegrationStatus,
  MessageType,
  SubscriptionType,
  IntegrationErrorCode,
  IntegrationError,
} from './types';

export type {
  WebSocketConnection,
  StreamDefinition,
  HookDefinition,
  HookImplementation,
  HookExecutionContext,
  IntegrationLayerConfig,
  WebSocketServerConfig,
  ExecuteWorkflowRequest,
  SubscribeRequest,
  HookRegistration,
} from './types';