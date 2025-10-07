/**
 * Hook Response Validator
 *
 * Purpose: Validate that hook responses conform to Claude Code format
 * WBS Task: 6.6 Hook Test Harness
 *
 * Validates JSON structure, required fields, and message format for hook responses
 */

import { z } from 'zod';

/**
 * Hook response schema (based on Claude Code hooks specification)
 */
const HookResponseSchema = z.object({
  message: z.string().optional(),
  decision: z.enum(['allow', 'block']).optional(),
  hookSpecificOutput: z
    .object({
      additionalContext: z.string().optional(),
    })
    .optional(),
});

type HookResponse = z.infer<typeof HookResponseSchema>;

/**
 * Validation result
 */
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  response?: HookResponse;
}

/**
 * Validate hook response structure
 */
export function validateHookResponse(response: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if response is an object
  if (typeof response !== 'object' || response === null) {
    return {
      valid: false,
      errors: ['Response must be a JSON object'],
      warnings: [],
    };
  }

  // Validate against schema
  const parseResult = HookResponseSchema.safeParse(response);

  if (!parseResult.success) {
    parseResult.error.issues.forEach((issue) => {
      errors.push(`${issue.path.join('.')}: ${issue.message}`);
    });

    return {
      valid: false,
      errors,
      warnings,
    };
  }

  const validatedResponse = parseResult.data;

  // Additional validation rules
  if (validatedResponse.decision === 'block' && !validatedResponse.message) {
    warnings.push('Blocking without a message may confuse users');
  }

  if (validatedResponse.message && validatedResponse.message.length > 5000) {
    warnings.push('Message is very long (>5000 chars), consider shortening');
  }

  // Check for common agent injection patterns (UserPromptSubmit response)
  if (validatedResponse.message) {
    const msg = validatedResponse.message;

    if (msg.includes('subagent')) {
      // Validate agent injection format
      if (!msg.includes('-simple') && !msg.includes('-moderate') && !msg.includes('-complex')) {
        warnings.push(
          'Agent injection message should include complexity level (e.g., backend-architect-moderate)'
        );
      }

      const agentRoles = [
        'backend-architect',
        'frontend-architect',
        'java-backend-developer',
        'nextjs-react-developer',
        'reviewer',
        'debugger',
        'e2e-test-architect',
      ];

      const hasValidRole = agentRoles.some((role) => msg.includes(role));
      if (!hasValidRole) {
        warnings.push('Agent injection message should include a valid agent role');
      }
    }

    // Check for completion message pattern
    if (msg.toLowerCase().includes('workflow complete') || msg.toLowerCase().includes('all agents finished')) {
      if (!msg.includes('✅') && !msg.includes('Summary')) {
        warnings.push('Completion message should include a summary or success indicator');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    response: validatedResponse,
  };
}

/**
 * Print validation result to console
 */
export function printValidationResult(result: ValidationResult): void {
  console.log('\n📋 Validation Result:\n');

  if (result.valid) {
    console.log('✅ Valid hook response\n');

    if (result.response?.message) {
      console.log('Message preview:');
      const preview = result.response.message.substring(0, 200);
      console.log(`   ${preview}${result.response.message.length > 200 ? '...' : ''}\n`);
    }

    if (result.response?.decision) {
      console.log(`Decision: ${result.response.decision}\n`);
    }
  } else {
    console.log('❌ Invalid hook response\n');
  }

  if (result.errors.length > 0) {
    console.log('Errors:');
    result.errors.forEach((error) => {
      console.log(`   ❌ ${error}`);
    });
    console.log();
  }

  if (result.warnings.length > 0) {
    console.log('Warnings:');
    result.warnings.forEach((warning) => {
      console.log(`   ⚠️  ${warning}`);
    });
    console.log();
  }
}

/**
 * Validate response from JSON string
 */
export function validateResponseJSON(jsonString: string): ValidationResult {
  try {
    const response = JSON.parse(jsonString);
    return validateHookResponse(response);
  } catch (error) {
    return {
      valid: false,
      errors: ['Invalid JSON: ' + (error instanceof Error ? error.message : String(error))],
      warnings: [],
    };
  }
}

/**
 * CLI interface
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
🔍 CCOrch Hook Response Validator

Usage:
  pnpm harness:validate <response.json>
  pnpm harness:validate --stdin

Examples:
  pnpm harness:validate tests/fixtures/sample-response.json
  echo '{"message": "Use backend-architect-moderate..."}' | pnpm harness:validate --stdin

Options:
  --help, -h    Show this help message
  --stdin       Read JSON from stdin instead of file
    `);
    process.exit(0);
  }

  let jsonString: string;

  if (args[0] === '--stdin') {
    // Read from stdin
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    jsonString = Buffer.concat(chunks).toString('utf-8');
  } else {
    // Read from file
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const filePath = resolve(process.cwd(), args[0]);

    console.log(`📂 Loading response from: ${filePath}\n`);

    try {
      jsonString = readFileSync(filePath, 'utf-8');
    } catch (error) {
      console.error('❌ Error reading file:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  const result = validateResponseJSON(jsonString);
  printValidationResult(result);

  process.exit(result.valid ? 0 : 1);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
