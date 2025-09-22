import { TestClient } from 'test/test-client';
import { HttpStatus } from '@nestjs/common';
import { FeedbackType } from './entities/feedback.entity';

describe('FeedbackController (e2e)', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
  });

  describe('POST /api/v1/feedback', () => {
    describe('Authenticated user scenarios', () => {
      const feedbackTestCases = [
        {
          type: FeedbackType.BUG,
          description: 'Found a bug in the application',
        },
        {
          type: FeedbackType.SUGGESTION,
          description: 'Here is my suggestion for improvement',
        },
        {
          type: FeedbackType.FEATURE,
          description: 'Would like to see this new feature',
        },
        {
          type: FeedbackType.OTHER,
          description: 'General feedback about the product',
        },
      ];

      feedbackTestCases.forEach(({ type, description }) => {
        it(`should create feedback with ${type.toLowerCase()} type`, async () => {
          const feedbackData = { type, description };

          const response = await client
            .post('/api/v1/feedback')
            .send(feedbackData)
            .expect(HttpStatus.CREATED);

          expect(response.body).toBeDefined();
          expect(response.body.id).toBeDefined();

          // Validate creation via internal API
          const createdFeedback = await client.get(
            `/internal/api/v1/feedback/${response.body.id}`,
          );

          expect(createdFeedback.body.type).toBe(type);
          expect(createdFeedback.body.description).toBe(description);
          expect(createdFeedback.body.user_id).toBe(client.user.id);
        });
      });

      it('should create feedback with optional contact info', async () => {
        const feedbackData = {
          type: FeedbackType.BUG,
          description: 'Bug with contact info',
          contactInfo: 'test@example.com',
        };

        await client
          .post('/api/v1/feedback')
          .send(feedbackData)
          .expect(HttpStatus.CREATED);
      });

      it('should create feedback with minimal required fields', async () => {
        const feedbackData = {
          type: FeedbackType.OTHER,
          description: 'Minimal feedback',
        };

        await client
          .post('/api/v1/feedback')
          .send(feedbackData)
          .expect(HttpStatus.CREATED);
      });

      it('should create feedback with maximum description length', async () => {
        const feedbackData = {
          type: FeedbackType.OTHER,
          description: 'a'.repeat(5000), // Max length
        };

        await client
          .post('/api/v1/feedback')
          .send(feedbackData)
          .expect(HttpStatus.CREATED);
      });

      it('should create feedback with maximum contact info length', async () => {
        const feedbackData = {
          type: FeedbackType.OTHER,
          description: 'Feedback with max contact info',
          contactInfo: 'b'.repeat(500), // Max length
        };

        await client
          .post('/api/v1/feedback')
          .send(feedbackData)
          .expect(HttpStatus.CREATED);
      });
    });

    describe('Unauthenticated user scenarios', () => {
      it('should create feedback without authentication', async () => {
        const feedbackData = {
          type: FeedbackType.BUG,
          description: 'Anonymous feedback',
        };

        const feedbackCreateResponse = await client
          .request()
          .post('/api/v1/feedback')
          .send(feedbackData)
          .expect(HttpStatus.CREATED);

        const feedbackGetResponse = await client
          .get(`/internal/api/v1/feedback/${feedbackCreateResponse.body.id}`)
          .expect(HttpStatus.OK);

        expect(feedbackGetResponse.body.type).toEqual(feedbackData.type);
        expect(feedbackGetResponse.body.description).toEqual(
          feedbackData.description,
        );
        expect(feedbackGetResponse.body.user_id).toBeNull();
      });
    });

    describe('Image upload scenarios', () => {
      it('should create feedback with valid image upload', async () => {
        // Create a simple test image buffer (1x1 PNG)
        const testImageBuffer = Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
          0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
          0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
          0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63,
          0xf8, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00,
          0x00, 0x37, 0x6e, 0xf9, 0x24, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
          0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
        ]);

        const response = await client
          .request()
          .post('/api/v1/feedback')
          .set('Authorization', `Bearer ${client.user.token}`)
          .set('Cookie', `token=${client.user.token}`)
          .field('type', FeedbackType.BUG)
          .field('description', 'Feedback with image')
          .attach('image', testImageBuffer, 'test.png')
          .expect(HttpStatus.CREATED);

        expect(response.body).toBeDefined();
      });

      it('should reject non-image file upload', async () => {
        const textBuffer = Buffer.from('This is not an image');

        await client
          .request()
          .post('/api/v1/feedback')
          .set('Authorization', `Bearer ${client.user.token}`)
          .set('Cookie', `token=${client.user.token}`)
          .field('type', FeedbackType.BUG)
          .field('description', 'Feedback with invalid file')
          .attach('image', textBuffer, 'test.txt')
          .expect(HttpStatus.BAD_REQUEST);
      });

      it('should reject oversized image file', async () => {
        // Create a buffer larger than 5MB
        const largeBuffer = Buffer.alloc(6 * 1024 * 1024); // 6MB

        await client
          .request()
          .post('/api/v1/feedback')
          .set('Authorization', `Bearer ${client.user.token}`)
          .set('Cookie', `token=${client.user.token}`)
          .field('type', FeedbackType.BUG)
          .field('description', 'Feedback with large image')
          .attach('image', largeBuffer, 'large.png')
          .expect(HttpStatus.PAYLOAD_TOO_LARGE);
      });
    });

    describe('Validation scenarios', () => {
      it('should fail with invalid feedback type', async () => {
        const feedbackData = {
          type: 'invalid-type',
          description: 'Valid description',
        };

        await client
          .post('/api/v1/feedback')
          .send(feedbackData)
          .expect(HttpStatus.BAD_REQUEST);
      });

      it('should fail with missing type', async () => {
        const feedbackData = {
          description: 'Description without type',
        };

        await client
          .post('/api/v1/feedback')
          .send(feedbackData)
          .expect(HttpStatus.BAD_REQUEST);
      });

      it('should fail with missing description', async () => {
        const feedbackData = {
          type: FeedbackType.BUG,
        };

        await client
          .post('/api/v1/feedback')
          .send(feedbackData)
          .expect(HttpStatus.BAD_REQUEST);
      });

      it('should fail with empty description', async () => {
        const feedbackData = {
          type: FeedbackType.BUG,
          description: '',
        };

        await client
          .post('/api/v1/feedback')
          .send(feedbackData)
          .expect(HttpStatus.BAD_REQUEST);
      });

      it('should fail with description exceeding max length', async () => {
        const feedbackData = {
          type: FeedbackType.BUG,
          description: 'a'.repeat(5001), // Exceeds max length
        };

        await client
          .post('/api/v1/feedback')
          .send(feedbackData)
          .expect(HttpStatus.BAD_REQUEST);
      });

      it('should fail with contact info exceeding max length', async () => {
        const feedbackData = {
          type: FeedbackType.BUG,
          description: 'Valid description',
          contactInfo: 'b'.repeat(501), // Exceeds max length
        };

        await client
          .post('/api/v1/feedback')
          .send(feedbackData)
          .expect(HttpStatus.BAD_REQUEST);
      });
    });
  });
});
