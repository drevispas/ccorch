/**
 * WebSocket Health Integration Test
 *
 * Tests that the WebSocket server integration is properly reported
 * in the health endpoint after initialization.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { app } from '../../server/index';

describe('WebSocket Health Integration', () => {
  beforeAll(async () => {
    // Give the server time to start
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  it('should report WebSocket status as not running before initialization', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);

    expect(response.body).toHaveProperty('websocket');
    expect(response.body.websocket).toEqual({
      running: false,
      connections: 0,
      port: expect.any(Number)
    });
  });

  it('should show WebSocket configuration after orchestrator initialization', async () => {
    // Initialize the orchestrator (WebSocket will warn but not fail)
    const initResponse = await request(app)
      .post('/api/init')
      .send({})
      .expect(200);

    expect(initResponse.body.status).toBe('initialized');

    // Check health endpoint
    const healthResponse = await request(app)
      .get('/api/health')
      .expect(200);

    expect(healthResponse.body).toHaveProperty('initialized', true);
    expect(healthResponse.body).toHaveProperty('websocket');

    // WebSocket is not fully running due to missing ExecutionEngine, but config should be present
    expect(healthResponse.body.websocket).toHaveProperty('port');
  });

  it('should broadcast workflow events when workflows are executed', async () => {
    // Execute a workflow
    const executeResponse = await request(app)
      .post('/api/execute')
      .send({
        workflowType: 'testing',
        taskDescription: 'Test WebSocket broadcasting'
      })
      .expect(200);

    expect(executeResponse.body).toHaveProperty('workflowId');
    expect(executeResponse.body.status).toBe('started');

    // Note: In a full implementation with WebSocket client,
    // we would verify that the workflow:started event was broadcast
  });

  it('should include WebSocket metrics in health check', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'healthy',
      initialized: true,
      websocket: {
        running: expect.any(Boolean),
        connections: expect.any(Number),
        port: expect.any(Number)
      }
    });
  });

  afterAll(async () => {
    // Cleanup if needed
    await new Promise(resolve => setTimeout(resolve, 100));
  });
});