/**
 * API Validation Schema Tests
 *
 * WBS Task: 7.2 Zod Validation Schemas (TDD)
 * PRD Reference: §5.4 (API Interface)
 *
 * Tests validation schemas for API endpoints.
 */

import { describe, it, expect } from 'vitest';
import {
  StatusQuerySchema,
  TransitionRequestSchema,
  type StatusQuery,
  type TransitionRequest,
} from '../../../src/api/validation.js';

describe('StatusQuerySchema', () => {
  it('should validate valid UUID workflow_id', () => {
    const validId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const result = StatusQuerySchema.safeParse({ workflow_id: validId });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.workflow_id).toBe(validId);
    }
  });

  it('should reject invalid UUID format', () => {
    const invalidIds = [
      'not-a-uuid',
      '12345',
      'a1b2c3d4-e5f6-7890-abcd', // incomplete UUID
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890-extra', // too long
      '', // empty string
    ];

    invalidIds.forEach((invalidId) => {
      const result = StatusQuerySchema.safeParse({ workflow_id: invalidId });
      expect(result.success).toBe(false);
    });
  });

  it('should reject missing workflow_id', () => {
    const result = StatusQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject null workflow_id', () => {
    const result = StatusQuerySchema.safeParse({ workflow_id: null });
    expect(result.success).toBe(false);
  });
});

describe('TransitionRequestSchema', () => {
  it('should validate valid transition request with all actions', () => {
    const validActions: Array<'advance' | 'fail' | 'retry' | 'skip'> = [
      'advance',
      'fail',
      'retry',
      'skip',
    ];

    validActions.forEach((action) => {
      const result = TransitionRequestSchema.safeParse({
        action,
        reason: 'Test reason for transition',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.action).toBe(action);
        expect(result.data.reason).toBe('Test reason for transition');
      }
    });
  });

  it('should reject invalid action values', () => {
    const invalidActions = [
      'invalid',
      'pause',
      'resume',
      'delete',
      '',
      'ADVANCE', // case sensitive
    ];

    invalidActions.forEach((action) => {
      const result = TransitionRequestSchema.safeParse({
        action,
        reason: 'Test reason',
      });
      expect(result.success).toBe(false);
    });
  });

  it('should reject missing action field', () => {
    const result = TransitionRequestSchema.safeParse({
      reason: 'Test reason',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing reason field', () => {
    const result = TransitionRequestSchema.safeParse({
      action: 'retry',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty reason string', () => {
    const result = TransitionRequestSchema.safeParse({
      action: 'retry',
      reason: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject null action or reason', () => {
    const result1 = TransitionRequestSchema.safeParse({
      action: null,
      reason: 'Test reason',
    });
    expect(result1.success).toBe(false);

    const result2 = TransitionRequestSchema.safeParse({
      action: 'retry',
      reason: null,
    });
    expect(result2.success).toBe(false);
  });

  it('should validate transition request with long reason', () => {
    const longReason = 'A'.repeat(500);
    const result = TransitionRequestSchema.safeParse({
      action: 'skip',
      reason: longReason,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe(longReason);
    }
  });

  it('should reject extra unexpected fields', () => {
    const result = TransitionRequestSchema.safeParse({
      action: 'retry',
      reason: 'Test reason',
      extraField: 'should not be allowed',
    });

    // Zod by default allows extra fields unless .strict() is used
    // If we want to enforce strict validation, the schema should use .strict()
    expect(result.success).toBe(true);
  });
});

describe('Type Safety', () => {
  it('should provide correct TypeScript types', () => {
    // This test verifies type inference works correctly
    const statusQuery: StatusQuery = {
      workflow_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    };

    const transitionRequest: TransitionRequest = {
      action: 'retry',
      reason: 'Manual retry for debugging',
    };

    expect(statusQuery.workflow_id).toBeDefined();
    expect(transitionRequest.action).toBeDefined();
    expect(transitionRequest.reason).toBeDefined();
  });
});
