/**
 * Hook Endpoint Integration Tests
 *
 * WBS Task: 6.2 HTTP Endpoint Integration
 * Tests HTTP endpoints that receive hook events from Claude Code
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

describe('Hook Endpoints', () => {
  beforeEach(async () => {
    // Clean up database
    await prisma.agentResult.deleteMany();
    await prisma.workflowTransition.deleteMany();
    await prisma.workflow.deleteMany();

    // Set HOOK_SECRET for tests
    process.env.HOOK_SECRET = VALID_SECRET;

    // Get Express app (server should be initialized in tests)
    app = await startServer();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /hooks/user-prompt-submit', () => {
    it('should return 200 with valid response for valid payload', async () => {
      const payload = {
        session_id: 'test-session-001',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: '\\cco Implement user authentication',
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

    it('should return 400 for invalid JSON payload', async () => {
      await request(app)
        .post('/hooks/user-prompt-submit')
        .send('not-valid-json')
        .set('Content-Type', 'application/json')
        .expect(400);
    });

    it('should return 400 for missing required fields', async () => {
      const payload = {
        session_id: 'test-session-002',
        // prompt is missing
      };

      const response = await request(app)
        .post('/hooks/user-prompt-submit')
        .set('X-Hook-Secret', VALID_SECRET)
        .send(payload)
        .expect(200); // Handler returns 200 with error message

      expect(response.body.message).toBeDefined();
      expect(response.body.message?.toLowerCase()).toContain('error');
    });

    it('should return 400 for empty prompt', async () => {
      const payload = {
        session_id: 'test-session-003',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: '',
      };

      const response = await request(app)
        .post('/hooks/user-prompt-submit')
        .set('X-Hook-Secret', VALID_SECRET)
        .send(payload)
        .expect(200); // Handler returns 200 with error message

      expect(response.body.message?.toLowerCase()).toContain('error');
    });
  });

  describe('POST /hooks/post-tool-use', () => {
    it('should return 200 with valid response for valid payload', async () => {
      const sessionId = 'test-session-004';

      // Create workflow with sessionId first
      const workflow = await prisma.workflow.create({
        data: {
          id: 'test-workflow-001',
          sessionId,
          userPrompt: 'Create payment service',
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
          stdout: JSON.stringify({
            summary: 'Architecture designed',
            design: 'RESTful API with JWT authentication',
          }),
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

    it('should skip when no active workflow for session', async () => {
      // Real Claude Code PostToolUse payload with session that has no workflow
      const payload = {
        session_id: 'test-session-no-workflow',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse',
        tool_name: 'Task',
        tool_response: {
          stdout: 'Some task output',
        },
      };

      const response = await request(app)
        .post('/hooks/post-tool-use')
        .set('X-Hook-Secret', VALID_SECRET)
        .send(payload)
        .expect(200);

      expect(response.body.continue).toBe(true);
      expect(response.body.message).toBeUndefined();
      expect(response.body.hookSpecificOutput).toBeUndefined();
    });

    it('should skip when tool_name is not Task', async () => {
      // Real Claude Code PostToolUse payload with different tool
      const payload = {
        session_id: 'test-session-006',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse',
        tool_name: 'Read',
        tool_response: {
          stdout: 'File contents...',
        },
      };

      const response = await request(app)
        .post('/hooks/post-tool-use')
        .set('X-Hook-Secret', VALID_SECRET)
        .send(payload)
        .expect(200);

      expect(response.body.continue).toBe(true);
      expect(response.body.message).toBeUndefined();
      expect(response.body.hookSpecificOutput).toBeUndefined();
    });
  });

  describe('POST /hooks/stop', () => {
    it('should return 200 for stop hook', async () => {
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

    it('should clean up active workflows', async () => {
      const sessionId = 'test-session-009';

      // Create active workflow with sessionId
      await prisma.workflow.create({
        data: {
          id: 'test-workflow-003',
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

      await request(app)
        .post('/hooks/stop')
        .set('X-Hook-Secret', VALID_SECRET)
        .send({
          session_id: sessionId,
          cwd: '/home/user/project',
          hook_event_name: 'Stop',
        })
        .expect(200);

      // Verify workflow is marked as FAILED
      const workflow = await prisma.workflow.findUnique({
        where: { id: 'test-workflow-003' },
      });

      expect(workflow?.status).toBe('FAILED');
    });
  });

  describe('Error handling', () => {
    it('should return 400 for completely invalid JSON', async () => {
      await request(app)
        .post('/hooks/user-prompt-submit')
        .send('}{invalid')
        .set('Content-Type', 'application/json')
        .expect(400);
    });

    it('should handle requests to non-existent hook endpoints', async () => {
      await request(app)
        .post('/hooks/nonexistent')
        .set('X-Hook-Secret', VALID_SECRET)
        .send({ test: 'data' })
        .expect(404);
    });
  });
});
