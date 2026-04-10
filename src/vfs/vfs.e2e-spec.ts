import { TestClient } from 'test/test-client';
import { FileInfoDto } from 'omniboxd/vfs/dto/file-info.dto';
import { GetResponseDto } from 'omniboxd/vfs/dto/get.response.dto';
import { listResponseDto } from 'omniboxd/vfs/dto/list.response.dto';

describe('VFS (e2e)', () => {
  let client: TestClient;
  const testFiles: string[] = [];

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    // Clean up test files
    for (const path of testFiles) {
      try {
        await client
          .delete(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
          .query({ path });
      } catch {
        // Ignore cleanup errors
      }
    }
    await client.close();
  });

  describe('Create', () => {
    test.each([
      {
        path: '/private/hello.md',
        resource: { content: 'Hello World!', name: 'hello' },
        expectedCode: 201,
      },
      {
        path: '/private/path/to/unexists/hello.md',
        resource: { content: 'Hello World!', name: 'hello' },
        expectedCode: 201,
      },
      {
        path: '/private/hello',
        resource: { content: 'Hello World!', name: 'hello' },
        expectedCode: 400,
      },
      {
        path: '/private/path/to/hello',
        resource: { content: 'Hello World!', name: 'hello' },
        expectedCode: 400,
      },
      {
        path: '/hello.md',
        resource: { content: 'Hello World!', name: 'hello' },
        expectedCode: 400,
      },
      {
        path: '/foo/hello.md',
        resource: { content: 'Hello World!', name: 'hello' },
        expectedCode: 400,
      },
      {
        path: '/private/hello.md',
        resource: { content: 'Hello World!', name: 'hello' },
        expectedCode: 409,
      },
    ])('$expectedCode $path', async ({ path, resource, expectedCode }) => {
      const createResponse = await client
        .put(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .send({
          path,
          content: resource.content,
        })
        .expect(expectedCode);
      if (expectedCode === 201) {
        const fileInfoDto = createResponse.body as FileInfoDto;
        expect(fileInfoDto.name).toEqual(resource.name);
        expect(fileInfoDto.path).toEqual(path);
        testFiles.push(path);
      }
    });
  });

  describe('List', () => {
    test('should list root directories', async () => {
      const response = await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/list`)
        .query({ path: '/' })
        .expect(200);

      const result = response.body as listResponseDto;
      expect(result.path).toEqual('/');
      expect(result.resources).toHaveLength(2);
      expect(result.resources.some((r) => r.name === 'private')).toBe(true);
      expect(result.resources.some((r) => r.name === 'teamspace')).toBe(true);
    });

    test('should list private directory contents', async () => {
      // First create a test file
      const testPath = '/private/list-test-file.md';
      await client
        .put(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .send({
          path: testPath,
          content: 'Test content',
        })
        .expect(201);
      testFiles.push(testPath);

      const response = await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/list`)
        .query({ path: '/private' })
        .expect(200);

      const result = response.body as listResponseDto;
      expect(result.path).toEqual('/private');
      expect(result.resources.length).toBeGreaterThanOrEqual(1);
      expect(result.resources.some((r) => r.name === 'list-test-file.md')).toBe(
        true,
      );
    });

    test('should list nested directory contents', async () => {
      const response = await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/list`)
        .query({ path: '/private/path/to' })
        .expect(200);

      const result = response.body as listResponseDto;
      expect(result.path).toEqual('/private/path/to');
      expect(result.resources.length).toBeGreaterThanOrEqual(1);
    });

    test('should return 400 for invalid path', async () => {
      await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/list`)
        .query({ path: '/invalid/path' })
        .expect(400);
    });

    test('should return 400 when listing a file as directory', async () => {
      await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/list`)
        .query({ path: '/private/hello.md' })
        .expect(400);
    });
  });

  describe('Get', () => {
    test('should get file content by path', async () => {
      const testPath = '/private/get-test-file.md';
      const testContent = 'Test content for get endpoint';

      await client
        .put(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .send({
          path: testPath,
          content: testContent,
        })
        .expect(201);
      testFiles.push(testPath);

      const response = await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .query({ path: testPath })
        .expect(200);

      const result = response.body as GetResponseDto;
      expect(result.path).toEqual(testPath);
      expect(result.content).toEqual(testContent);
      expect(result.id).toBeDefined();
    });

    test('should return 400 for directory path', async () => {
      await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .query({ path: '/private' })
        .expect(400);
    });

    test('should return 400 for root path', async () => {
      await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .query({ path: '/' })
        .expect(400);
    });

    test('should return 404 for non-existent file', async () => {
      await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .query({ path: '/private/non-existent-file.md' })
        .expect(404);
    });

    test('should return 400 for invalid path without space type', async () => {
      await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .query({ path: '/invalid/file.md' })
        .expect(400);
    });
  });

  describe('Delete', () => {
    test('should delete file by path', async () => {
      const testPath = '/private/delete-test-file.md';

      await client
        .put(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .send({
          path: testPath,
          content: 'Content to delete',
        })
        .expect(201);

      await client
        .delete(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .query({ path: testPath })
        .expect(200);

      // Verify file is deleted
      await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .query({ path: testPath })
        .expect(404);
    });

    test('should return 404 for non-existent file', async () => {
      await client
        .delete(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .query({ path: '/private/non-existent-delete.md' })
        .expect(404);
    });

    test('should return 400 for invalid path', async () => {
      await client
        .delete(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .query({ path: '/invalid/file.md' })
        .expect(400);
    });
  });

  describe('Rename', () => {
    test('should rename file by path', async () => {
      const oldPath = '/private/rename-test-file.md';
      const newName = 'renamed-file.md';
      const newPath = '/private/renamed-file.md';

      await client
        .put(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .send({
          path: oldPath,
          content: 'Content to rename',
        })
        .expect(201);
      testFiles.push(newPath);

      await client
        .patch(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/rename`)
        .send({
          path: oldPath,
          new_name: newName,
        })
        .expect(200);

      // Verify old path returns 404
      await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .query({ path: oldPath })
        .expect(404);

      // Verify new path works
      const response = await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .query({ path: newPath })
        .expect(200);

      expect(response.body.path).toEqual(newPath);
    });

    test('should return 404 for non-existent file', async () => {
      await client
        .patch(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/rename`)
        .send({
          path: '/private/non-existent-rename.md',
          new_name: 'new-name',
        })
        .expect(404);
    });

    test('should return 400 when renaming doc without .md suffix', async () => {
      const testPath = '/private/rename-no-md-test.md';

      await client
        .put(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .send({
          path: testPath,
          content: 'Content',
        })
        .expect(201);
      testFiles.push(testPath);

      await client
        .patch(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/rename`)
        .send({
          path: testPath,
          new_name: 'new-name-without-md',
        })
        .expect(400);
    });

    test('should rename doc with .md suffix and strip it in db', async () => {
      const oldPath = '/private/rename-md-suffix-test.md';
      const newName = 'renamed-with-md.md';
      const expectedNewPath = '/private/renamed-with-md.md';

      await client
        .put(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .send({
          path: oldPath,
          content: 'Content to rename',
        })
        .expect(201);

      await client
        .patch(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/rename`)
        .send({
          path: oldPath,
          new_name: newName,
        })
        .expect(200);

      // Verify old path returns 404
      await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .query({ path: oldPath })
        .expect(404);

      // Verify new path works
      const response = await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .query({ path: expectedNewPath })
        .expect(200);

      expect(response.body.path).toEqual(expectedNewPath);
      testFiles.push(expectedNewPath);
    });
  });

  describe('Move', () => {
    test('should move file to new parent directory', async () => {
      const sourcePath = '/private/move-test-file.md';
      const targetDir = '/private/path/to';
      const targetPath = '/private/path/to/move-test-file.md';

      await client
        .put(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .send({
          path: sourcePath,
          content: 'Content to move',
        })
        .expect(201);

      await client
        .patch(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/move`)
        .send({
          path: sourcePath,
          new_parent_path: targetDir,
        })
        .expect(200);

      // Verify old path returns 404
      await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .query({ path: sourcePath })
        .expect(404);

      // Verify new path works
      const response = await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .query({ path: targetPath })
        .expect(200);

      expect(response.body.path).toEqual(targetPath);

      // Cleanup
      await client
        .delete(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .query({ path: targetPath })
        .expect(200);
    });

    test('should return 404 for non-existent source file', async () => {
      await client
        .patch(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/move`)
        .send({
          path: '/private/non-existent-move.md',
          new_parent_path: '/private',
        })
        .expect(404);
    });

    test('should return 404 for non-existent target directory', async () => {
      const testPath = '/private/move-source-test.md';

      await client
        .put(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .send({
          path: testPath,
          content: 'Content',
        })
        .expect(201);
      testFiles.push(testPath);

      await client
        .patch(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/move`)
        .send({
          path: testPath,
          new_parent_path: '/private/non-existent-dir',
        })
        .expect(404);
    });
  });

  describe('Filter', () => {
    test('should filter resources by path', async () => {
      const testPath = '/private/filter-test-file.md';
      await client
        .put(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .send({
          path: testPath,
          content: 'Filter test content',
        })
        .expect(201);
      testFiles.push(testPath);

      const response = await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/filter`)
        .query({
          path: '/private',
          options: JSON.stringify({ name_pattern: 'filter-test' }),
        })
        .expect(200);

      expect(response.body.resources).toBeDefined();
      expect(response.body.total).toBeDefined();
      expect(
        response.body.resources.some((r: FileInfoDto) =>
          r.path?.includes('filter-test'),
        ),
      ).toBe(true);
    });

    test('should filter without path parameter', async () => {
      const response = await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/filter`)
        .query({
          options: JSON.stringify({ name_pattern: 'hello' }),
        })
        .expect(200);

      expect(response.body.resources).toBeDefined();
      expect(response.body.total).toBeDefined();
    });
  });

  describe('GetPathByResourceId', () => {
    test('should get path by resource id', async () => {
      const testPath = '/private/path-by-id-test.md';

      const createResponse = await client
        .put(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .send({
          path: testPath,
          content: 'Test content for path by id',
        })
        .expect(201);
      testFiles.push(testPath);

      const resourceId = createResponse.body.id;

      const response = await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/path`)
        .query({
          resource_id: resourceId,
          is_dir: false,
        })
        .expect(200);

      expect(response.body.path).toEqual(testPath);
    });

    test('should return 400 without resource_id', async () => {
      await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/path`)
        .query({ is_dir: false })
        .expect(400);
    });
  });

  describe('Public API - List', () => {
    test('should list via public API endpoint', async () => {
      const response = await client
        .get(`/api/v1/namespaces/${client.namespace.id}/vfs/list`)
        .query({ path: '' })
        .expect(200);

      const result = response.body as listResponseDto;
      expect(result.resources).toHaveLength(2);
      expect(result.resources.some((r) => r.name === 'private')).toBe(true);
      expect(result.resources.some((r) => r.name === 'teamspace')).toBe(true);
    });
  });
});
