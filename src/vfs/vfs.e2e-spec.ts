import { TestClient } from 'test/test-client';
import { FileInfoDto } from 'omniboxd/vfs/dto/file-info.dto';

describe('VFS (e2e)', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
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
      }
    });
  });
});
