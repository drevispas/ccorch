/**
 * Authentication Module for WebSocket Connections
 *
 * Provides authentication and authorization functionality for the integration layer
 */

import { createHash, randomBytes } from 'crypto';
import { IntegrationError, IntegrationErrorCode } from './types';

export interface AuthToken {
  id: string;
  clientId: string;
  issuedAt: Date;
  expiresAt: Date;
  permissions: string[];
  metadata?: Record<string, any>;
}

export interface AuthCredentials {
  clientId: string;
  clientSecret?: string;
  apiKey?: string;
  token?: string;
}

export class AuthenticationService {
  private static readonly TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly API_KEY_PREFIX = 'orc_';
  private activeTokens: Map<string, AuthToken> = new Map();
  private apiKeys: Map<string, string> = new Map(); // clientId -> hashedApiKey
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    this.initializeDefaultKeys();
    this.startTokenCleanup();
  }

  /**
   * Initialize default API keys for development
   * In production, these should come from a secure store
   */
  private initializeDefaultKeys(): void {
    // Development keys - should be replaced with environment variables in production
    if (process.env.NODE_ENV !== 'production') {
      this.registerApiKey('dev-client', 'dev-api-key-123');
    }
  }

  /**
   * Register a new API key for a client
   */
  public registerApiKey(clientId: string, apiKey: string): void {
    const hashedKey = this.hashApiKey(apiKey);
    this.apiKeys.set(clientId, hashedKey);
  }

  /**
   * Authenticate a client using various methods
   */
  public async authenticate(credentials: AuthCredentials): Promise<AuthToken> {
    try {
      // Method 1: Token-based authentication
      if (credentials.token) {
        return this.validateToken(credentials.token);
      }

      // Method 2: API Key authentication
      if (credentials.apiKey && credentials.clientId) {
        return this.authenticateWithApiKey(credentials.clientId, credentials.apiKey);
      }

      // Method 3: Client secret authentication (for trusted clients)
      if (credentials.clientSecret && credentials.clientId) {
        return this.authenticateWithSecret(credentials.clientId, credentials.clientSecret);
      }

      throw new IntegrationError(
        'No valid authentication method provided',
        IntegrationErrorCode.AUTHENTICATION_FAILED
      );
    } catch (error) {
      if (error instanceof IntegrationError) {
        throw error;
      }
      throw new IntegrationError(
        'Authentication failed',
        IntegrationErrorCode.AUTHENTICATION_FAILED
      );
    }
  }

  /**
   * Validate an existing token
   */
  private validateToken(tokenId: string): AuthToken {
    const token = this.activeTokens.get(tokenId);

    if (!token) {
      throw new IntegrationError(
        'Invalid or expired token',
        IntegrationErrorCode.AUTHENTICATION_FAILED
      );
    }

    if (token.expiresAt < new Date()) {
      this.activeTokens.delete(tokenId);
      throw new IntegrationError(
        'Token has expired',
        IntegrationErrorCode.AUTHENTICATION_FAILED
      );
    }

    return token;
  }

  /**
   * Authenticate using API key
   */
  private authenticateWithApiKey(clientId: string, apiKey: string): AuthToken {
    const storedHash = this.apiKeys.get(clientId);

    if (!storedHash) {
      throw new IntegrationError(
        'Unknown client',
        IntegrationErrorCode.AUTHENTICATION_FAILED
      );
    }

    const providedHash = this.hashApiKey(apiKey);

    if (storedHash !== providedHash) {
      throw new IntegrationError(
        'Invalid API key',
        IntegrationErrorCode.AUTHENTICATION_FAILED
      );
    }

    return this.createToken(clientId, ['read', 'write', 'execute']);
  }

  /**
   * Authenticate using client secret (simplified for development)
   */
  private authenticateWithSecret(clientId: string, clientSecret: string): AuthToken {
    // In production, this should validate against a secure store
    if (process.env.NODE_ENV !== 'production' &&
        clientId === 'dev-client' &&
        clientSecret === 'dev-secret') {
      return this.createToken(clientId, ['read', 'write', 'execute', 'admin']);
    }

    throw new IntegrationError(
      'Invalid client credentials',
      IntegrationErrorCode.AUTHENTICATION_FAILED
    );
  }

  /**
   * Create a new authentication token
   */
  private createToken(clientId: string, permissions: string[]): AuthToken {
    const token: AuthToken = {
      id: this.generateTokenId(),
      clientId,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + AuthenticationService.TOKEN_EXPIRY_MS),
      permissions,
      metadata: {
        userAgent: 'orchestrator-client',
        environment: process.env.NODE_ENV || 'development'
      }
    };

    this.activeTokens.set(token.id, token);
    return token;
  }

  /**
   * Generate a secure token ID
   */
  private generateTokenId(): string {
    return `token_${Date.now()}_${randomBytes(16).toString('hex')}`;
  }

  /**
   * Hash an API key for secure storage
   */
  private hashApiKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Check if a token has specific permission
   */
  public hasPermission(token: AuthToken, permission: string): boolean {
    return token.permissions.includes(permission) ||
           token.permissions.includes('admin');
  }

  /**
   * Revoke a token
   */
  public revokeToken(tokenId: string): void {
    this.activeTokens.delete(tokenId);
  }

  /**
   * Clean up expired tokens periodically
   */
  private startTokenCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = new Date();
      for (const [id, token] of this.activeTokens) {
        if (token.expiresAt < now) {
          this.activeTokens.delete(id);
        }
      }
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Stop the cleanup interval
   */
  public stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * Get all active tokens for a client
   */
  public getClientTokens(clientId: string): AuthToken[] {
    const tokens: AuthToken[] = [];
    for (const token of this.activeTokens.values()) {
      if (token.clientId === clientId) {
        tokens.push(token);
      }
    }
    return tokens;
  }

  /**
   * Refresh a token
   */
  public refreshToken(tokenId: string): AuthToken {
    const oldToken = this.validateToken(tokenId);
    this.revokeToken(tokenId);
    return this.createToken(oldToken.clientId, oldToken.permissions);
  }

  /**
   * Generate a new API key for a client
   */
  public generateApiKey(clientId: string): string {
    const apiKey = `${AuthenticationService.API_KEY_PREFIX}${randomBytes(32).toString('hex')}`;
    this.registerApiKey(clientId, apiKey);
    return apiKey;
  }
}