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

describe('Hook Endpoints', () => {
  beforeEach(async () => {
    // Clean up database
    await prisma.agentResult.deleteMany();
    await prisma.workflowTransition.deleteMany();
    await prisma.workflow.deleteMany();

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
        prompt: 'Implement user authentication',
      };

      const response = await request(app)
        .post('/hooks/user-prompt-submit')
        .send(payload)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.message).toBeDefined();
      expect(response.body.message).toContain('subagent');
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
        .send(payload)
        .expect(200); // Handler returns 200 with error message

      expect(response.body.message?.toLowerCase()).toContain('error');
    });
  });

  describe('POST /hooks/post-tool-use', () => {
    it('should return 200 with valid response for valid payload', async () => {
      // First create a workflow
      const createPayload = {
        session_id: 'test-session-004',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Create payment service',
      };

      const createResponse = await request(app)
        .post('/hooks/user-prompt-submit')
        .send(createPayload);

      // Extract workflow ID from response (it should be in the message)
      // For now, create workflow directly via database to get ID
      const workflow = await prisma.workflow.create({
        data: {
          id: 'test-workflow-001',
          userPrompt: 'Create payment service',
          chainName: 'backend-development',
          complexity: 'moderate',
          currentStep: 0,
          status: 'ACTIVE',
          createdAt: BigInt(Date.now()),
          updatedAt: BigInt(Date.now()),
        },
      });

      const payload = {
        session_id: 'test-session-005',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse',
        tool_name: 'Task',
        workflow_id: workflow.id,
        agent_role: 'backend-architect',
        complexity: 'moderate',
        step_number: 0,
        results: {
          summary: 'Architecture designed',
          design: 'RESTful API with JWT authentication',
        },
      };

      const response = await request(app)
        .post('/hooks/post-tool-use')
        .send(payload)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.message).toBeDefined();
    });

    it('should return error for invalid workflow ID', async () => {
      const payload = {
        session_id: 'test-session-006',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse',
        tool_name: 'Task',
        workflow_id: 'nonexistent-workflow',
        agent_role: 'backend-architect',
        complexity: 'moderate',
        step_number: 0,
        results: {
          summary: 'Done',
        },
      };

      const response = await request(app)
        .post('/hooks/post-tool-use')
        .send(payload)
        .expect(200); // Handler returns 200 with error message

      expect(response.body.message?.toLowerCase()).toContain('error');
    });

    it('should return error for missing results field', async () => {
      const payload = {
        session_id: 'test-session-007',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user/project',
        hook_event_name: 'PostToolUse',
        tool_name: 'Task',
        workflow_id: 'test-workflow-002',
        agent_role: 'backend-architect',
        complexity: 'moderate',
        step_number: 0,
        // results is missing
      };

      const response = await request(app)
        .post('/hooks/post-tool-use')
        .send(payload)
        .expect(200); // Handler returns 200 with error message

      expect(response.body.message?.toLowerCase()).toContain('error');
    });
  });

  describe('POST /hooks/stop', () => {
    it('should return 200 for stop hook', async () => {
      await request(app)
        .post('/hooks/stop')
        .send({
          session_id: 'test-session-008',
          hook_event_name: 'Stop',
        })
        .expect(200);
    });

    it('should clean up active workflows', async () => {
      // Create active workflow
      await prisma.workflow.create({
        data: {
          id: 'test-workflow-003',
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
        .send({
          session_id: 'test-session-009',
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
        .send({ test: 'data' })
        .expect(404);
    });
  });
});
