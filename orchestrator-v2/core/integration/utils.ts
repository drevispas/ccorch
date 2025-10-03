/**
 * Integration Layer Utilities
 *
 * Collection of utility functions and helpers for the integration layer
 */

import { v4 as uuidv4 } from 'uuid';
import { WebSocketConnection, MessageType, BaseMessage, ResponseMessage, IntegrationError, IntegrationErrorCode } from './types';

export class IntegrationUtils {
  /**
   * Generate a unique message ID
   */
  static generateMessageId(): string {
    return `msg_${Date.now()}_${uuidv4().slice(0, 8)}`;
  }

  /**
   * Generate a unique session ID
   */
  static generateSessionId(): string {
    return `session_${Date.now()}_${uuidv4().slice(0, 8)}`;
  }

  /**
   * Generate a unique correlation ID
   */
  static generateCorrelationId(): string {
    return `corr_${Date.now()}_${uuidv4().slice(0, 8)}`;
  }

  /**
   * Create a standardized error response
   */
  static createErrorResponse(
    originalMessage: BaseMessage,
    error: IntegrationError | Error | string,
    correlationId?: string
  ): ResponseMessage<null> {
    const errorMessage = typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : 'Unknown error';

    const errorCode = error instanceof IntegrationError
      ? error.code
      : IntegrationErrorCode.PROTOCOL_ERROR;

    return {
      id: this.generateMessageId(),
      type: MessageType.ERROR,
      timestamp: new Date(),
      correlationId: correlationId || originalMessage.id,
      replyTo: originalMessage.id,
      payload: null,
      success: false,
      error: errorMessage,
    };
  }

  /**
   * Create a standardized success response
   */
  static createSuccessResponse<T>(
    originalMessage: BaseMessage,
    payload: T,
    correlationId?: string
  ): ResponseMessage<T> {
    return {
      id: this.generateMessageId(),
      type: originalMessage.type,
      timestamp: new Date(),
      correlationId: correlationId || originalMessage.id,
      replyTo: originalMessage.id,
      payload,
      success: true,
    };
  }

  /**
   * Validate WebSocket connection
   */
  static isValidConnection(connection: WebSocketConnection): boolean {
    return !!(
      connection &&
      connection.id &&
      connection.socket &&
      connection.sessionId &&
      connection.isAuthenticated
    );
  }

  /**
   * Check if connection is active
   */
  static isConnectionActive(connection: WebSocketConnection): boolean {
    return connection.socket.readyState === 1; // WebSocket.OPEN
  }

  /**
   * Format connection info for logging
   */
  static formatConnectionInfo(connection: WebSocketConnection): object {
    return {
      id: connection.id,
      sessionId: connection.sessionId,
      clientId: connection.clientId,
      version: connection.version,
      connectedAt: connection.connectedAt,
      lastActivity: connection.lastActivity,
      subscriptionCount: connection.subscriptions.size,
      isAuthenticated: connection.isAuthenticated,
      remoteAddress: connection.metadata.remoteAddress,
      userAgent: connection.metadata.userAgent,
    };
  }

  /**
   * Serialize message for transmission
   */
  static serializeMessage(message: BaseMessage): string {
    try {
      return JSON.stringify(message, (key, value) => {
        // Handle Date objects
        if (value instanceof Date) {
          return value.toISOString();
        }
        return value;
      });
    } catch (error) {
      throw new IntegrationError(
        `Failed to serialize message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        IntegrationErrorCode.INVALID_MESSAGE
      );
    }
  }

  /**
   * Deserialize message from transmission
   */
  static deserializeMessage(data: string | Buffer): BaseMessage {
    try {
      const text = data.toString();
      const parsed = JSON.parse(text);

      // Restore Date objects
      if (parsed.timestamp) {
        parsed.timestamp = new Date(parsed.timestamp);
      }

      // Validate required fields
      if (!parsed.id || !parsed.type || !parsed.timestamp) {
        throw new Error('Invalid message format - missing required fields');
      }

      return parsed as BaseMessage;
    } catch (error) {
      throw new IntegrationError(
        `Failed to deserialize message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        IntegrationErrorCode.INVALID_MESSAGE
      );
    }
  }

  /**
   * Calculate message size in bytes
   */
  static getMessageSize(message: BaseMessage): number {
    return Buffer.byteLength(this.serializeMessage(message), 'utf8');
  }

  /**
   * Check if message size is within limits
   */
  static isMessageSizeValid(message: BaseMessage, maxSize: number): boolean {
    return this.getMessageSize(message) <= maxSize;
  }

  /**
   * Throttle function execution
   */
  static throttle<T extends (...args: any[]) => any>(
    func: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let lastExecution = 0;

    return (...args: Parameters<T>): void => {
      const now = Date.now();
      if (now - lastExecution >= delay) {
        lastExecution = now;
        func(...args);
      }
    };
  }

  /**
   * Debounce function execution
   */
  static debounce<T extends (...args: any[]) => any>(
    func: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout;

    return (...args: Parameters<T>): void => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  }

  /**
   * Retry function with exponential backoff
   */
  static async retry<T>(
    func: () => Promise<T>,
    maxAttempts: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error = new Error('No attempts made');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await func();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (attempt === maxAttempts) {
          break;
        }

        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new IntegrationError(
      `Operation failed after ${maxAttempts} attempts: ${lastError.message}`,
      IntegrationErrorCode.CONNECTION_FAILED
    );
  }

  /**
   * Create timeout promise
   */
  static createTimeoutPromise<T>(timeoutMs: number, errorMessage?: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new IntegrationError(
          errorMessage || `Operation timed out after ${timeoutMs}ms`,
          IntegrationErrorCode.CONNECTION_FAILED
        ));
      }, timeoutMs);
    });
  }

  /**
   * Race promise with timeout
   */
  static async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMessage?: string
  ): Promise<T> {
    return Promise.race([
      promise,
      this.createTimeoutPromise<T>(timeoutMs, errorMessage)
    ]);
  }

  /**
   * Safe JSON parse
   */
  static safeJsonParse<T = any>(text: string, defaultValue?: T): T | undefined {
    try {
      return JSON.parse(text);
    } catch {
      return defaultValue;
    }
  }

  /**
   * Validate version compatibility
   */
  static isVersionCompatible(
    clientVersion: string,
    serverVersion: string,
    toleranceMajor: number = 0,
    toleranceMinor: number = 1
  ): boolean {
    try {
      const parseVersion = (version: string) => {
        const parts = version.split('.').map(Number);
        return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
      };

      const client = parseVersion(clientVersion);
      const server = parseVersion(serverVersion);

      // Major version must be exact or within tolerance
      if (Math.abs(client.major - server.major) > toleranceMajor) {
        return false;
      }

      // Minor version tolerance
      if (client.major === server.major) {
        return Math.abs(client.minor - server.minor) <= toleranceMinor;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create circuit breaker
   */
  static createCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
    func: T,
    options: {
      failureThreshold: number;
      resetTimeout: number;
      monitoringPeriod: number;
    } = {
      failureThreshold: 5,
      resetTimeout: 60000,
      monitoringPeriod: 10000,
    }
  ) {
    let failures = 0;
    let lastFailureTime = 0;
    let state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

    return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
      const now = Date.now();

      // Reset if monitoring period has passed
      if (now - lastFailureTime > options.monitoringPeriod) {
        failures = 0;
      }

      // Check circuit breaker state
      if (state === 'OPEN') {
        if (now - lastFailureTime < options.resetTimeout) {
          throw new IntegrationError(
            'Circuit breaker is OPEN',
            IntegrationErrorCode.SERVER_OVERLOADED
          );
        } else {
          state = 'HALF_OPEN';
        }
      }

      try {
        const result = await func(...args);

        // Success - reset circuit breaker
        if (state === 'HALF_OPEN') {
          state = 'CLOSED';
          failures = 0;
        }

        return result;
      } catch (error) {
        failures++;
        lastFailureTime = now;

        if (failures >= options.failureThreshold) {
          state = 'OPEN';
        }

        throw error;
      }
    };
  }

  /**
   * Format bytes for human reading
   */
  static formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Format duration for human reading
   */
  static formatDuration(milliseconds: number): string {
    if (milliseconds < 1000) {
      return `${milliseconds}ms`;
    }

    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Create rate limiter
   */
  static createRateLimiter(
    maxRequests: number,
    windowMs: number
  ): (key: string) => boolean {
    const requests = new Map<string, number[]>();

    return (key: string): boolean => {
      const now = Date.now();
      const windowStart = now - windowMs;

      // Get existing requests for this key
      let keyRequests = requests.get(key) || [];

      // Filter out requests outside the window
      keyRequests = keyRequests.filter(time => time > windowStart);

      // Check if under limit
      if (keyRequests.length >= maxRequests) {
        return false;
      }

      // Add current request
      keyRequests.push(now);
      requests.set(key, keyRequests);

      return true;
    };
  }
}