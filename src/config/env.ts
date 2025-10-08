/**
 * Environment Configuration
 *
 * Purpose: Load and validate environment variables using Zod
 * Ensures required config is present and properly typed before app starts
 */

import { config } from 'dotenv';
import { z } from 'zod';

// Load .env file into process.env
// This must happen before schema validation
config();

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
});

/**
 * Parse and validate environment variables
 * Throws error if validation fails (fail-fast on startup)
 */
function parseEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map(
        (issue) => `  - ${issue.path.join('.')}: ${issue.message}`
      ).join('\n');

      throw new Error(
        `Environment validation failed:\n${errorMessages}\n\n` +
        'Please check your .env file and ensure all required variables are set.\n' +
        'See .env.example for reference.'
      );
    }
    throw error;
  }
}

/**
 * Validated environment configuration
 * Available as singleton throughout the application
 */
export const env = parseEnv();

/**
 * TypeScript type for validated environment
 */
export type Env = z.infer<typeof envSchema>;
