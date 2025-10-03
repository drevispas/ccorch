# Integration Layer - Session 6

## Overview

The Integration Layer provides real-time bidirectional communication between Claude Code and the orchestrator engine through WebSocket server and streaming support. It bridges the ReactiveExecutionEngine's Observable streams with external clients for real-time workflow execution monitoring and control.

## Architecture

```
┌─────────────────┐    WebSocket    ┌──────────────────────┐
│   Claude Code   │ ←─────────────→ │   WebSocket Server   │
└─────────────────┘                 └──────────────────────┘
                                             │
                                             ▼
┌─────────────────────────────────────────────────────────────┐
│                Integration Layer                           │
├─────────────────────────────────────────────────────────────┤
│  • WebSocket Server (real-time communication)              │
│  • Streaming Bridge (Observable → WebSocket)               │
│  • Hook Versioning System                                  │
│  • Message Protocol Handler                                │
│  • Authentication & Authorization                          │
└─────────────────────────────────────────────────────────────┘
                                             │
                                             ▼
┌─────────────────────────────────────────────────────────────┐
│              Core Orchestrator Engine                      │
├─────────────────────────────────────────────────────────────┤
│  • ReactiveExecutionEngine (Observable streams)            │
│  • EventDrivenStateManager (CQRS + EventBus)              │
│  • WorkflowDSL + Compiler                                  │
│  • Plugin-based Agent System                               │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. WebSocket Server (`websocket-server.ts`)
- Real-time bidirectional communication
- Connection management and authentication
- Message routing and protocol handling
- Auto-reconnection and heartbeat

### 2. Streaming Bridge (`streaming-bridge.ts`)
- Converts RxJS Observables to WebSocket streams
- Bidirectional data flow management
- Stream subscription lifecycle management
- Backpressure handling

### 3. Hook System (`hook-manager.ts`)
- Version-aware hook registration
- Hook compatibility matrix
- Hook execution pipeline
- Migration support for hook format changes

### 4. Integration Protocol (`protocol.ts`)
- Standardized message format
- Request/response correlation
- Event broadcasting
- Error propagation

### 5. Integration Testing Framework (`tests/`)
- End-to-end integration tests
- WebSocket connection testing
- Stream integrity verification
- Hook compatibility testing

## Key Features

### Real-time Workflow Execution
- Live workflow status updates
- Task progress streaming
- Real-time error notifications
- Performance metrics streaming

### Bidirectional Communication
- Command execution from Claude Code
- Real-time query responses
- Interactive workflow control (pause/resume/cancel)
- Dynamic configuration updates

### Hook Versioning
- Semantic versioning for hooks
- Backward compatibility support
- Automatic migration of hook formats
- Version negotiation during connection

### Stream Management
- Multiple concurrent workflow streams
- Client-specific stream filtering
- Stream aggregation and multiplexing
- Graceful degradation on network issues

## Integration Points

### Phase 1 Components
- **EventDrivenStateManager**: Subscribe to state changes for real-time updates
- **Plugin System**: Stream agent status and results
- **Type-Safe Server**: Extend HTTP server with WebSocket upgrade

### Phase 2 Components
- **ReactiveExecutionEngine**: Bridge Observable streams to WebSocket
- **WorkflowDSL**: Stream compiled workflow execution
- **Execution Monitor**: Real-time metrics and debugging info

## Message Protocol

### Connection Handshake
```typescript
interface ConnectionRequest {
  type: 'connect';
  version: string;
  clientId: string;
  capabilities: string[];
  auth?: AuthToken;
}

interface ConnectionResponse {
  type: 'connected';
  sessionId: string;
  serverVersion: string;
  supportedFeatures: string[];
}
```

### Workflow Execution Streaming
```typescript
interface WorkflowExecutionStream {
  type: 'workflow_execution';
  workflowId: string;
  events: Observable<ExecutionEvent>;
  controls: {
    pause: () => Promise<void>;
    resume: () => Promise<void>;
    cancel: () => Promise<void>;
  };
}
```

### Hook Registration
```typescript
interface HookRegistration {
  type: 'register_hook';
  hookName: string;
  version: string;
  implementation: HookImplementation;
  dependencies?: string[];
}
```

## Performance Considerations

- **Connection Pooling**: Efficient WebSocket connection management
- **Stream Multiplexing**: Multiple logical streams per WebSocket connection
- **Backpressure Handling**: Prevent memory overflow on slow clients
- **Selective Streaming**: Client-specified event filtering to reduce bandwidth

## Error Handling

- **Connection Recovery**: Automatic reconnection with exponential backoff
- **Stream Recovery**: Resume streams from last known state
- **Hook Fallbacks**: Graceful degradation when hooks fail
- **Circuit Breaker**: Prevent cascade failures in integration layer

## Testing Strategy

- **Unit Tests**: Individual component testing
- **Integration Tests**: Cross-component communication testing
- **End-to-End Tests**: Full Claude Code → Orchestrator workflows
- **Performance Tests**: Load testing with multiple concurrent connections
- **Chaos Tests**: Network partition and failure recovery testing