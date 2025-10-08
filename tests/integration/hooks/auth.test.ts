/**
 * Hook Authentication Integration Tests
 *
 * WBS Task: 6.3 Hook Authentication Integration Tests
 * Tests that hook endpoints enforce authentication via X-Hook-Secret header
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { startServer } from '../../../src/server';
import type { Express } from 'express';

const prisma = new PrismaClient();
let app: Express;

// Test secret (should match HOOK_SECRET in .env for E2E tests)
const VALID_SECRET = 'test-secret-12345';
const INVALID_SECRET = 'wrong-secret';

describe('Hook Authentication', () => {
  beforeEach(async () => {
    // Clean up database
    await prisma.agentResult.deleteMany();
    await prisma.workflowTransition.deleteMany();
    await prisma.workflow.deleteMany();

    // Set HOOK_SECRET for tests
    process.env.HOOK_SECRET = VALID_SECRET;

    // Get Express app
    app = await startServer();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Missing authentication header', () => {
    it('should return 401 for user-prompt-submit without auth header', async () => {
      const payload = {
        session_id: 'test-session-001',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Test task',
      };

      await request(app)
        .post('/hooks/user-prompt-submit')
        .send(payload)
        .expect(401);
    });

    it('should return 401 for post-tool-use without auth header', async () => {
      // Real Claude Code PostToolUse payload structure
      const payload = {
        session_id: 'test-session-002',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse',
        tool_name: 'Task',
        tool_response: {
          stdout: 'Task output',
        },
      };

      await request(app)
        .post('/hooks/post-tool-use')
        .send(payload)
        .expect(401);
    });

    it('should return 401 for stop without auth header', async () => {
      await request(app)
        .post('/hooks/stop')
        .send({
          session_id: 'test-session-003',
          cwd: '/home/user/project',
          hook_event_name: 'Stop',
        })
        .expect(401);
    });
  });

  describe('Invalid authentication', () => {
    it('should return 403 for invalid X-Hook-Secret', async () => {
      const payload = {
        session_id: 'test-session-004',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Test task',
      };

      await request(app)
        .post('/hooks/user-prompt-submit')
        .set('X-Hook-Secret', INVALID_SECRET)
        .send(payload)
        .expect(403);
    });

    it('should return 403 for empty X-Hook-Secret', async () => {
      const payload = {
        session_id: 'test-session-005',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Test task',
      };

      await request(app)
        .post('/hooks/user-prompt-submit')
        .set('X-Hook-Secret', '')
        .send(payload)
        .expect(403);
    });
  });

  describe('Valid authentication', () => {
    it('should allow user-prompt-submit with valid X-Hook-Secret', async () => {
      const payload = {
        session_id: 'test-session-006',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: '\\cco Implement authentication',
      };

      const response = await request(app)
        .post('/hooks/user-prompt-submit')
        .set('X-Hook-Secret', VALID_SECRET)
        .send(payload)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.continue).toBe(true);
      expect(response.body.hookSpecificOutput).toBeDefined();
      expect(response.body.hookSpecificOutput.additionalContext).toContain('subagent');
    });

    it('should allow post-tool-use with valid X-Hook-Secret', async () => {
      const sessionId = 'test-session-007';

      // Create workflow with sessionId first
      // Note: The workflow needs proper chain config with at least 2 steps for PostToolUse to work
      await prisma.workflow.create({
        data: {
          id: 'test-workflow-auth-001',
          sessionId,
          userPrompt: 'Test task',
          chainName: 'backend-development',
          complexity: 'moderate',
          currentStep: 0,
          status: 'ACTIVE',
          createdAt: BigInt(Date.now()),
          updatedAt: BigInt(Date.now()),
        },
      });

      // Real Claude Code PostToolUse payload structure
      const payload = {
        session_id: sessionId,
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse',
        tool_name: 'Task',
        tool_response: {
          stdout: 'Architecture designed',
        },
      };

      const response = await request(app)
        .post('/hooks/post-tool-use')
        .set('X-Hook-Secret', VALID_SECRET)
        .send(payload)
        .expect(200);

      expect(response.body).toBeDefined();
      // Response could be either continue (next step) or message (workflow complete/failed)
      // Just check that we got a valid response structure
      expect(response.body.continue !== undefined || response.body.message !== undefined).toBe(true);
    });

    it('should allow stop with valid X-Hook-Secret', async () => {
      await request(app)
        .post('/hooks/stop')
        .set('X-Hook-Secret', VALID_SECRET)
        .send({
          session_id: 'test-session-008',
          cwd: '/home/user/project',
          hook_event_name: 'Stop',
        })
        .expect(200);
    });
  });

});

// Separate describe block for dev mode test to avoid parent beforeEach interference
describe('Hook Authentication - Dev Mode', () => {
  let localApp: Express;
  const localPrisma = new PrismaClient();

  afterAll(async () => {
    await localPrisma.$disconnect();
  });

  it('should allow all requests when HOOK_SECRET is not set (dev mode)', async () => {
    // Clean up database first
    await localPrisma.agentResult.deleteMany();
    await localPrisma.workflowTransition.deleteMany();
    await localPrisma.workflow.deleteMany();

    // Save and clear HOOK_SECRET before starting server
    const originalSecret = process.env.HOOK_SECRET;
    process.env.HOOK_SECRET = ''; // Set to empty string instead of deleting

    try {
      // Start server without HOOK_SECRET
      localApp = await startServer();

      const payload = {
        session_id: 'test-session-009',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: '\\cco Test without auth',
      };

      // Should work without auth header when HOOK_SECRET is not set
      const response = await request(localApp)
        .post('/hooks/user-prompt-submit')
        .send(payload)
        .expect(200);

      expect(response.body.continue).toBe(true);
      expect(response.body.hookSpecificOutput).toBeDefined();
    } finally {
      // Restore original HOOK_SECRET for other tests
      if (originalSecret) {
        process.env.HOOK_SECRET = originalSecret;
      }
    }
  });
});
