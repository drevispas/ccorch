/**
 * Environment Configuration
 *
 * Purpose: Load and validate environment variables using Zod
 * Ensures required config is present and properly typed before app starts
 */

import { z } from 'zod';

/**
 * Environment variable schema
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

/**
 * Parse and validate environment variables
 * Throws error if validation fails (fail-fast on startup)
 */
export const env = envSchema.parse(process.env);

/**
 * TypeScript type for validated environment
 */
export type Env = z.infer<typeof envSchema>;
