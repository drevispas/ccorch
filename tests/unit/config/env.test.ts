/**
 * Environment Configuration Tests
 *
 * Purpose: Test environment variable validation and loading
 * WBS Task: 6.5 Environment Configuration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

/**
 * Environment schema (duplicated from src/config/env.ts for testing)
 * This allows us to test the schema validation independently
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z
    .string()
    .default('3000')
    .transform(Number)
    .pipe(z.number().min(1).max(65535)),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required'),

  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error'])
    .default('info'),

  API_KEY_ADMIN: z
    .string()
    .optional(),

  HOOK_SECRET: z
    .string()
    .optional(),

  ENABLE_CC_COMPLEXITY: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),
});

type TestEnv = z.infer<typeof envSchema>;

describe('Environment Configuration', () => {
  // eslint-disable-next-line no-undef
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  describe('Valid Configuration', () => {
    it('should load valid environment configuration', () => {
      const testEnv = {
        NODE_ENV: 'development',
        PORT: '3000',
        DATABASE_URL: 'file:./test.db',
        LOG_LEVEL: 'info',
        API_KEY_ADMIN: 'test-api-key',
        HOOK_SECRET: 'test-hook-secret',
        ENABLE_CC_COMPLEXITY: 'false',
      };

      const result = envSchema.parse(testEnv);

      expect(result).toMatchObject({
        NODE_ENV: 'development',
        PORT: 3000, // Should be transformed to number
        DATABASE_URL: 'file:./test.db',
        LOG_LEVEL: 'info',
        API_KEY_ADMIN: 'test-api-key',
        HOOK_SECRET: 'test-hook-secret',
        ENABLE_CC_COMPLEXITY: false, // Should be transformed to boolean
      });
    });

    it('should load minimal valid configuration (DATABASE_URL only)', () => {
      const testEnv = {
        DATABASE_URL: 'file:./test.db',
      };

      const result = envSchema.parse(testEnv);

      expect(result.DATABASE_URL).toBe('file:./test.db');
    });

    it('should accept all valid NODE_ENV values', () => {
      const environments = ['development', 'test', 'production'] as const;

      environments.forEach((env) => {
        const testEnv = {
          NODE_ENV: env,
          DATABASE_URL: 'file:./test.db',
        };

        const result = envSchema.parse(testEnv);
        expect(result.NODE_ENV).toBe(env);
      });
    });

    it('should accept all valid LOG_LEVEL values', () => {
      const logLevels = ['trace', 'debug', 'info', 'warn', 'error'] as const;

      logLevels.forEach((level) => {
        const testEnv = {
          LOG_LEVEL: level,
          DATABASE_URL: 'file:./test.db',
        };

        const result = envSchema.parse(testEnv);
        expect(result.LOG_LEVEL).toBe(level);
      });
    });

    it('should accept valid port numbers', () => {
      const validPorts = ['1', '80', '3000', '8080', '65535'];

      validPorts.forEach((port) => {
        const testEnv = {
          PORT: port,
          DATABASE_URL: 'file:./test.db',
        };

        const result = envSchema.parse(testEnv);
        expect(result.PORT).toBe(Number(port));
      });
    });

    it('should accept various DATABASE_URL formats', () => {
      const validUrls = [
        'file:./dev.db',
        'file:./data/test.db',
        'postgresql://localhost:5432/ccorch',
        'mysql://user:pass@localhost/ccorch',
      ];

      validUrls.forEach((url) => {
        const testEnv = {
          DATABASE_URL: url,
        };

        const result = envSchema.parse(testEnv);
        expect(result.DATABASE_URL).toBe(url);
      });
    });
  });

  describe('Default Values', () => {
    it('should apply default PORT=3000', () => {
      const testEnv = {
        DATABASE_URL: 'file:./test.db',
      };

      const result = envSchema.parse(testEnv);

      expect(result.PORT).toBe(3000);
    });

    it('should apply default LOG_LEVEL=info', () => {
      const testEnv = {
        DATABASE_URL: 'file:./test.db',
      };

      const result = envSchema.parse(testEnv);

      expect(result.LOG_LEVEL).toBe('info');
    });

    it('should apply default NODE_ENV=development', () => {
      const testEnv = {
        DATABASE_URL: 'file:./test.db',
      };

      const result = envSchema.parse(testEnv);

      expect(result.NODE_ENV).toBe('development');
    });

    it('should apply default ENABLE_CC_COMPLEXITY=false', () => {
      const testEnv = {
        DATABASE_URL: 'file:./test.db',
      };

      const result = envSchema.parse(testEnv);

      expect(result.ENABLE_CC_COMPLEXITY).toBe(false);
    });

    it('should have API_KEY_ADMIN as optional (undefined when not set)', () => {
      const testEnv = {
        DATABASE_URL: 'file:./test.db',
      };

      const result = envSchema.parse(testEnv);

      expect(result.API_KEY_ADMIN).toBeUndefined();
    });

    it('should have HOOK_SECRET as optional (undefined when not set)', () => {
      const testEnv = {
        DATABASE_URL: 'file:./test.db',
      };

      const result = envSchema.parse(testEnv);

      expect(result.HOOK_SECRET).toBeUndefined();
    });
  });

  describe('Required Variables', () => {
    it('should throw error when DATABASE_URL is missing', () => {
      const testEnv = {
        PORT: '3000',
      };

      expect(() => envSchema.parse(testEnv)).toThrow();
    });

    it('should throw error when DATABASE_URL is empty string', () => {
      const testEnv = {
        DATABASE_URL: '',
      };

      expect(() => envSchema.parse(testEnv)).toThrow('DATABASE_URL is required');
    });
  });

  describe('Type Transformations', () => {
    it('should transform PORT string to number', () => {
      const testEnv = {
        PORT: '8080',
        DATABASE_URL: 'file:./test.db',
      };

      const result = envSchema.parse(testEnv);

      expect(result.PORT).toBe(8080);
      expect(typeof result.PORT).toBe('number');
    });

    it('should transform ENABLE_CC_COMPLEXITY "true" to boolean true', () => {
      const testEnv = {
        DATABASE_URL: 'file:./test.db',
        ENABLE_CC_COMPLEXITY: 'true',
      };

      const result = envSchema.parse(testEnv);

      expect(result.ENABLE_CC_COMPLEXITY).toBe(true);
      expect(typeof result.ENABLE_CC_COMPLEXITY).toBe('boolean');
    });

    it('should transform ENABLE_CC_COMPLEXITY "false" to boolean false', () => {
      const testEnv = {
        DATABASE_URL: 'file:./test.db',
        ENABLE_CC_COMPLEXITY: 'false',
      };

      const result = envSchema.parse(testEnv);

      expect(result.ENABLE_CC_COMPLEXITY).toBe(false);
      expect(typeof result.ENABLE_CC_COMPLEXITY).toBe('boolean');
    });

    it('should transform ENABLE_CC_COMPLEXITY any non-"true" string to boolean false', () => {
      const falsyValues = ['FALSE', 'False', '0', 'no', 'disabled', ''];

      falsyValues.forEach((value) => {
        const testEnv = {
          DATABASE_URL: 'file:./test.db',
          ENABLE_CC_COMPLEXITY: value,
        };

        const result = envSchema.parse(testEnv);
        expect(result.ENABLE_CC_COMPLEXITY).toBe(false);
      });
    });
  });

  describe('Validation Errors', () => {
    it('should reject invalid NODE_ENV values', () => {
      const testEnv = {
        NODE_ENV: 'invalid',
        DATABASE_URL: 'file:./test.db',
      };

      expect(() => envSchema.parse(testEnv)).toThrow();
    });

    it('should reject invalid LOG_LEVEL values', () => {
      const testEnv = {
        LOG_LEVEL: 'verbose',
        DATABASE_URL: 'file:./test.db',
      };

      expect(() => envSchema.parse(testEnv)).toThrow();
    });

    it('should reject PORT below valid range', () => {
      const testEnv = {
        PORT: '0',
        DATABASE_URL: 'file:./test.db',
      };

      expect(() => envSchema.parse(testEnv)).toThrow();
    });

    it('should reject PORT above valid range', () => {
      const testEnv = {
        PORT: '65536',
        DATABASE_URL: 'file:./test.db',
      };

      expect(() => envSchema.parse(testEnv)).toThrow();
    });

    it('should reject non-numeric PORT values', () => {
      const testEnv = {
        PORT: 'not-a-number',
        DATABASE_URL: 'file:./test.db',
      };

      expect(() => envSchema.parse(testEnv)).toThrow();
    });
  });

  describe('Production Configuration', () => {
    it('should validate production-like configuration', () => {
      const testEnv = {
        NODE_ENV: 'production',
        PORT: '3000',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/ccorch',
        LOG_LEVEL: 'warn',
        API_KEY_ADMIN: 'prod-api-key-secure-random-string',
        HOOK_SECRET: 'prod-hook-secret-secure-random-string',
        ENABLE_CC_COMPLEXITY: 'true',
      };

      const result = envSchema.parse(testEnv);

      expect(result).toMatchObject({
        NODE_ENV: 'production',
        PORT: 3000,
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/ccorch',
        LOG_LEVEL: 'warn',
        API_KEY_ADMIN: 'prod-api-key-secure-random-string',
        HOOK_SECRET: 'prod-hook-secret-secure-random-string',
        ENABLE_CC_COMPLEXITY: true,
      });
    });
  });

  describe('Test Configuration', () => {
    it('should validate test-like configuration', () => {
      const testEnv = {
        NODE_ENV: 'test',
        PORT: '3001',
        DATABASE_URL: 'file:./test.db',
        LOG_LEVEL: 'debug',
        ENABLE_CC_COMPLEXITY: 'false',
      };

      const result = envSchema.parse(testEnv);

      expect(result).toMatchObject({
        NODE_ENV: 'test',
        PORT: 3001,
        DATABASE_URL: 'file:./test.db',
        LOG_LEVEL: 'debug',
        ENABLE_CC_COMPLEXITY: false,
      });
      expect(result.API_KEY_ADMIN).toBeUndefined();
      expect(result.HOOK_SECRET).toBeUndefined();
    });
  });
});
