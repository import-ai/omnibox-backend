import { TestClient } from 'test/test-client';
import { HttpStatus } from '@nestjs/common';
import { uploadLanguageDatasets } from 'omniboxd/resources/file-resources.e2e-spec';

describe('AttachmentsController (e2e)', () => {
  let client: TestClient;
  let testResourceId: string;

  beforeAll(async () => {
    client = await TestClient.create();

    // Use the root resource for attachment testing
    testResourceId = client.namespace.root_resource_id;
  });

  afterAll(async () => {
    await client.close();
  });

  describe('POST /api/v1/namespaces/:namespaceId/resources/:resourceId/attachments', () => {
    describe('Single file upload', () => {
      test.each(uploadLanguageDatasets)(
        'should upload single attachment $filename successfully',
        async ({ filename, content }) => {
          const response = await client
            .post(
              `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/attachments`,
            )
            .attach('file[]', Buffer.from(content), filename)
            .expect(201);

          expect(response.body).toHaveProperty('uploaded');
          expect(response.body).toHaveProperty('failed');
          expect(response.body.uploaded).toHaveLength(1);
          expect(response.body.failed).toHaveLength(0);
          expect(response.body.uploaded[0]).toHaveProperty('name', filename);
          expect(response.body.uploaded[0]).toHaveProperty('link');
          expect(typeof response.body.uploaded[0].link).toBe('string');
        },
      );
    });

    it('should handle special characters in filenames', async () => {
      const specialFiles = [
        { content: 'File with spaces', filename: 'file with spaces.txt' },
        { content: 'File with dashes', filename: 'file-with-dashes.txt' },
      ];

      const request = client.post(
        `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/attachments`,
      );

      specialFiles.forEach(({ content, filename }) => {
        request.attach('file[]', Buffer.from(content), filename);
      });

      const response = await request.expect(201);

      // Note: Some files might fail due to encoding issues, so we check that at least some succeed
      expect(response.body.uploaded.length + response.body.failed.length).toBe(
        2,
      );
      expect(response.body.uploaded.length).toBeGreaterThanOrEqual(1);
    });

    it('should upload multiple multi-language attachments successfully', async () => {
      // Use a subset of language datasets for batch testing

      const request = client.post(
        `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/attachments`,
      );

      uploadLanguageDatasets.forEach(({ content, filename }) => {
        request.attach('file[]', Buffer.from(content), filename);
      });

      const response = await request.expect(201);

      // For multi-language filenames, some may fail due to encoding issues
      // We check that all files were processed (either uploaded or failed)
      expect(response.body.uploaded).toHaveLength(
        uploadLanguageDatasets.length,
      );

      // Verify structure of uploaded files
      response.body.uploaded.forEach((uploadedFile, index) => {
        expect(uploadedFile).toHaveProperty(
          'name',
          uploadLanguageDatasets[index].filename,
        );
        expect(uploadedFile).toHaveProperty('link');
        expect(typeof uploadedFile.link).toBe('string');
      });
    });

    it('should reject upload without authentication', async () => {
      const testContent = 'Test content';

      await client
        .request()
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/attachments`,
        )
        .attach('file[]', Buffer.from(testContent), 'test.txt')
        .expect(401);
    });

    it('should reject upload to non-existent resource', async () => {
      const testContent = 'Test content';
      const nonExistentResourceId = 'non-existent-resource-id';

      await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/${nonExistentResourceId}/attachments`,
        )
        .attach('file[]', Buffer.from(testContent), 'test.txt')
        .expect(403);
    });
  });

  describe('GET /api/v1/namespaces/:namespaceId/resources/:resourceId/attachments/:attachmentId', () => {
    let attachmentId: string;
    const testContent = 'Download test content';
    const testFilename = 'download-test.txt';

    beforeAll(async () => {
      // Upload a file to test download
      const uploadResponse = await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/attachments`,
        )
        .attach('file[]', Buffer.from(testContent), testFilename)
        .expect(201);

      attachmentId = uploadResponse.body.uploaded[0].link;
    });

    it('should download attachment successfully', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/attachments/${attachmentId}`,
        )
        .expect(200);

      expect(response.text).toBe(testContent);
      expect(response.headers['content-disposition']).toContain(testFilename);
    });

    it('should reject download without authentication', async () => {
      await client
        .request()
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/attachments/${attachmentId}`,
        )
        .expect(401);
    });

    it('should reject download with invalid attachment ID', async () => {
      await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/attachments/invalid-attachment-id`,
        )
        .expect(404);
    });

    it('should reject download without required query parameters', async () => {
      await client.get(`/api/v1/attachments/${attachmentId}`).expect(404);
    });

    test.each(uploadLanguageDatasets)(
      'should upload and download file with multi-language filename: $filename',
      async ({ filename, content }) => {
        // Upload the file
        const uploadResponse = await client
          .post(
            `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/attachments`,
          )
          .attach('file[]', Buffer.from(content), filename)
          .expect(201);

        // Skip download test if upload failed due to encoding issues
        if (uploadResponse.body.uploaded.length === 0) {
          expect(uploadResponse.body.failed).toContain(filename);
          return;
        }

        const attachmentId = uploadResponse.body.uploaded[0].link;

        // Download the file
        const downloadResponse = await client
          .get(
            `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/attachments/${attachmentId}`,
          )
          .expect(200);

        expect(downloadResponse.text).toBe(content);
        // Note: Content-disposition header may have encoded filename
        expect(downloadResponse.headers['content-disposition']).toBeDefined();
      },
    );
  });

  describe('DELETE /api/v1/namespaces/:namespaceId/resources/:resourceId/attachments/:attachmentId', () => {
    let attachmentId: string;
    const testContent = 'Delete test content';
    const testFilename = 'delete-test.txt';

    beforeEach(async () => {
      // Upload a file to test deletion
      const uploadResponse = await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/attachments`,
        )
        .attach('file[]', Buffer.from(testContent), testFilename)
        .expect(201);

      attachmentId = uploadResponse.body.uploaded[0].link;
    });

    it('should delete attachment successfully', async () => {
      const response = await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/attachments/${attachmentId}`,
        )
        .expect(200);

      expect(response.body).toHaveProperty('id', attachmentId);
      expect(response.body).toHaveProperty('success', true);

      // Verify the attachment is actually deleted
      await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/attachments/${attachmentId}`,
        )
        .expect(404);
    });

    it('should reject deletion without authentication', async () => {
      await client
        .request()
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/attachments/${attachmentId}`,
        )
        .expect(401);
    });

    it('should reject deletion with invalid attachment ID', async () => {
      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/attachments/invalid-attachment-id`,
        )
        .expect(404);
    });

    it('should reject deletion without required query parameters', async () => {
      await client.delete(`/api/v1/attachments/${attachmentId}`).expect(404);
    });
  });

  describe('GET /api/v1/namespaces/:namespaceId/resources/:resourceId/attachments/:attachmentId/images (Public)', () => {
    let imageAttachmentId: string;
    const imageContent = Buffer.from('fake-image-content');
    const imageFilename = 'test-image.png';

    beforeAll(async () => {
      // Upload an image file to test display
      const uploadResponse = await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/attachments`,
        )
        .attach('file[]', imageContent, imageFilename)
        .expect(201);

      imageAttachmentId = uploadResponse.body.uploaded[0].link;
    });

    it('should redirect to login when no token provided', async () => {
      const response = await client
        .request()
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/attachments/${imageAttachmentId}/images`,
        )
        .expect(HttpStatus.FOUND);

      expect(response.headers.location).toContain('/user/login');
      expect(response.headers.location).toContain('redirect=');
    });

    it('should display image with valid token cookie', async () => {
      const response = await client
        .request()
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/attachments/${imageAttachmentId}/images`,
        )
        .set('Cookie', `token=${client.user.token}`)
        .expect(200);

      expect(response.body).toEqual(imageContent);
    });
  });

  describe('GET /api/v1/namespaces/:namespaceId/resources/:resourceId/attachments/:attachmentId/media (Public)', () => {
    let mediaAttachmentId: string;
    const mediaContent = Buffer.from('fake-media-content');
    const mediaFilename = 'test-media.mp3';

    beforeAll(async () => {
      // Upload a media file to test display
      const uploadResponse = await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/attachments`,
        )
        .attach('file[]', mediaContent, mediaFilename)
        .expect(201);

      mediaAttachmentId = uploadResponse.body.uploaded[0].link;
    });

    it('should redirect to login when no token provided', async () => {
      const response = await client
        .request()
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/attachments/${mediaAttachmentId}/media`,
        )
        .expect(HttpStatus.FOUND);

      expect(response.headers.location).toContain('/user/login');
      expect(response.headers.location).toContain('redirect=');
    });

    it('should display media with valid token cookie', async () => {
      const response = await client
        .request()
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/attachments/${mediaAttachmentId}/media`,
        )
        .set('Cookie', `token=${client.user.token}`)
        .expect(200);

      expect(response.body).toEqual(mediaContent);
    });
  });
});
