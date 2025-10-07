import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { createDummyRouter } from '../../../src/api/dummy';

describe('Dummy Echo API Endpoint', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    const dummyRouter = createDummyRouter();
    app.use('/api/dummy', dummyRouter);
  });

  describe('POST /api/dummy/echo', () => {
    describe('Valid Requests', () => {
      it('should echo back a valid message', async () => {
        const testMessage = 'Hello, World!';

        const response = await request(app)
          .post('/api/dummy/echo')
          .send({ message: testMessage });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.echoed).toBe(testMessage);
      });

      it('should include timestamp in response', async () => {
        const response = await request(app)
          .post('/api/dummy/echo')
          .send({ message: 'test' });

        expect(response.body.data.timestamp).toBeDefined();
        expect(typeof response.body.data.timestamp).toBe('string');
        // Validate ISO 8601 format
        expect(response.body.data.timestamp).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        );
      });

      it('should include requestId in response', async () => {
        const response = await request(app)
          .post('/api/dummy/echo')
          .send({ message: 'test' });

        expect(response.body.data.requestId).toBeDefined();
        expect(typeof response.body.data.requestId).toBe('string');
        // Validate UUID v4 format
        expect(response.body.data.requestId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
      });

      it('should increment echoCount for each request', async () => {
        const response1 = await request(app)
          .post('/api/dummy/echo')
          .send({ message: 'first' });

        const response2 = await request(app)
          .post('/api/dummy/echo')
          .send({ message: 'second' });

        const response3 = await request(app)
          .post('/api/dummy/echo')
          .send({ message: 'third' });

        expect(response1.body.data.echoCount).toBe(1);
        expect(response2.body.data.echoCount).toBe(2);
        expect(response3.body.data.echoCount).toBe(3);
      });

      it('should echo back metadata when provided', async () => {
        const testMetadata = {
          userId: '123',
          sessionId: 'abc-def',
          tags: ['test', 'api']
        };

        const response = await request(app)
          .post('/api/dummy/echo')
          .send({
            message: 'test',
            metadata: testMetadata
          });

        expect(response.status).toBe(200);
        expect(response.body.data.metadata).toEqual(testMetadata);
      });

      it('should handle message at minimum length (1 char)', async () => {
        const response = await request(app)
          .post('/api/dummy/echo')
          .send({ message: 'a' });

        expect(response.status).toBe(200);
        expect(response.body.data.echoed).toBe('a');
      });

      it('should handle message at maximum length (500 chars)', async () => {
        const longMessage = 'a'.repeat(500);

        const response = await request(app)
          .post('/api/dummy/echo')
          .send({ message: longMessage });

        expect(response.status).toBe(200);
        expect(response.body.data.echoed).toBe(longMessage);
      });

      it('should not include metadata in response when not provided', async () => {
        const response = await request(app)
          .post('/api/dummy/echo')
          .send({ message: 'test' });

        expect(response.body.data.metadata).toBeUndefined();
      });
    });

    describe('Validation Errors', () => {
      it('should reject request with missing message', async () => {
        const response = await request(app)
          .post('/api/dummy/echo')
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toBe('Validation failed');
        expect(response.body.error.details).toBeDefined();
      });

      it('should reject request with empty message', async () => {
        const response = await request(app)
          .post('/api/dummy/echo')
          .send({ message: '' });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toBe('Validation failed');
      });

      it('should reject request with message exceeding 500 chars', async () => {
        const tooLongMessage = 'a'.repeat(501);

        const response = await request(app)
          .post('/api/dummy/echo')
          .send({ message: tooLongMessage });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toBe('Validation failed');
      });

      it('should reject request with non-string message', async () => {
        const response = await request(app)
          .post('/api/dummy/echo')
          .send({ message: 123 });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should reject request with null message', async () => {
        const response = await request(app)
          .post('/api/dummy/echo')
          .send({ message: null });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should include validation error details', async () => {
        const response = await request(app)
          .post('/api/dummy/echo')
          .send({ message: '' });

        expect(response.body.error.details).toBeDefined();
        expect(Array.isArray(response.body.error.details)).toBe(true);
        expect(response.body.error.details.length).toBeGreaterThan(0);
      });
    });

    describe('Response Format', () => {
      it('should return JSON content type', async () => {
        const response = await request(app)
          .post('/api/dummy/echo')
          .send({ message: 'test' });

        expect(response.headers['content-type']).toMatch(/application\/json/);
      });

      it('should have consistent success response structure', async () => {
        const response = await request(app)
          .post('/api/dummy/echo')
          .send({ message: 'test' });

        expect(response.body).toHaveProperty('success');
        expect(response.body).toHaveProperty('data');
        expect(response.body.data).toHaveProperty('echoed');
        expect(response.body.data).toHaveProperty('timestamp');
        expect(response.body.data).toHaveProperty('requestId');
        expect(response.body.data).toHaveProperty('echoCount');
      });

      it('should have consistent error response structure', async () => {
        const response = await request(app)
          .post('/api/dummy/echo')
          .send({ message: '' });

        expect(response.body).toHaveProperty('success');
        expect(response.body.success).toBe(false);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toHaveProperty('message');
      });
    });

    describe('Edge Cases', () => {
      it('should handle special characters in message', async () => {
        const specialMessage = '!@#$%^&*()_+-=[]{}|;:,.<>?';

        const response = await request(app)
          .post('/api/dummy/echo')
          .send({ message: specialMessage });

        expect(response.status).toBe(200);
        expect(response.body.data.echoed).toBe(specialMessage);
      });

      it('should handle unicode characters in message', async () => {
        const unicodeMessage = 'Hello 世界 🌍';

        const response = await request(app)
          .post('/api/dummy/echo')
          .send({ message: unicodeMessage });

        expect(response.status).toBe(200);
        expect(response.body.data.echoed).toBe(unicodeMessage);
      });

      it('should handle newlines in message', async () => {
        const multilineMessage = 'Line 1\nLine 2\nLine 3';

        const response = await request(app)
          .post('/api/dummy/echo')
          .send({ message: multilineMessage });

        expect(response.status).toBe(200);
        expect(response.body.data.echoed).toBe(multilineMessage);
      });

      it('should handle complex nested metadata', async () => {
        const complexMetadata = {
          level1: {
            level2: {
              level3: {
                value: 'deep'
              }
            }
          },
          array: [1, 2, 3, { nested: true }]
        };

        const response = await request(app)
          .post('/api/dummy/echo')
          .send({
            message: 'test',
            metadata: complexMetadata
          });

        expect(response.status).toBe(200);
        expect(response.body.data.metadata).toEqual(complexMetadata);
      });
    });

    describe('Counter Persistence', () => {
      it('should maintain counter state across requests', async () => {
        const responses = await Promise.all([
          request(app).post('/api/dummy/echo').send({ message: 'a' }),
          request(app).post('/api/dummy/echo').send({ message: 'b' }),
          request(app).post('/api/dummy/echo').send({ message: 'c' })
        ]);

        const counts = responses.map((r) => r.body.data.echoCount);
        expect(counts).toEqual([1, 2, 3]);
      });

      it('should generate unique requestIds for each request', async () => {
        const response1 = await request(app)
          .post('/api/dummy/echo')
          .send({ message: 'test1' });

        const response2 = await request(app)
          .post('/api/dummy/echo')
          .send({ message: 'test2' });

        expect(response1.body.data.requestId).not.toBe(
          response2.body.data.requestId
        );
      });
    });
  });
});
