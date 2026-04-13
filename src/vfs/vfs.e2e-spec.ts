import { TestClient } from 'test/test-client';
import { createResourceByPath } from 'test/vfs-utils';
import { FileInfoDto } from 'omniboxd/vfs/dto/file-info.dto';
import { plainToInstance } from 'class-transformer';
import { VFSService } from 'omniboxd/vfs/vfs.service';
import { GetResponseDto } from 'omniboxd/vfs/dto/get.response.dto';
import { last } from 'omniboxd/utils/arrays';

type Operation =
  | 'create'
  | 'read'
  | 'delete'
  | 'mkdir'
  | 'move'
  | 'filter'
  | 'list'
  | 'path'
  | 'rename'
  | 'get';

interface TestCase {
  index: number;
  expectedCode: number;
  op: Operation;
  body?: {
    path?: string;

    content?: string;

    new_parent_path?: string;

    new_name?: string;

    options?: {
      name_pattern?: string;
    };

    recursive?: boolean;
  };
}

const testCases: TestCase[] = [
  {
    index: 0,
    expectedCode: 201,
    op: 'create',
    body: {
      path: '/private/hello.md',
      content: 'hello',
    },
  },
  {
    index: 1,
    expectedCode: 201,
    op: 'create',
    body: { path: '/private/path/to/hello.md', content: 'hello' },
  },
  {
    index: 2,
    expectedCode: 400,
    op: 'create',
    body: { path: '/private/hello', content: 'hello' },
  },
  {
    index: 3,
    expectedCode: 400,
    op: 'create',
    body: { path: '/private/path/to/hello', content: 'hello' },
  },
  {
    index: 4,
    expectedCode: 400,
    op: 'create',
    body: { path: '/hello.md', content: 'hello' },
  },
  {
    index: 5,
    expectedCode: 400,
    op: 'create',
    body: { path: '/foo/hello.md', content: 'hello' },
  },
  {
    index: 6,
    expectedCode: 409,
    op: 'create',
    body: { path: '/private/hello.md', content: 'hello' },
  },
  {
    index: 7,
    expectedCode: 404,
    op: 'move',
    body: {
      path: '/private/hello.md',
      new_parent_path: '/private/path/to/unexists/',
    },
  },
  {
    index: 8,
    expectedCode: 404,
    op: 'move',
    body: {
      path: '/private/path/to/unexists/unexists.md',
      new_parent_path: '/private/',
    },
  },
  {
    index: 9,
    expectedCode: 400,
    op: 'move',
    body: {
      path: '/private/hello.md',
      new_parent_path: '/',
    },
  },
  {
    index: 10,
    expectedCode: 400,
    op: 'move',
    body: {
      path: '/private',
      new_parent_path: '/teamspace',
    },
  },
  {
    index: 11,
    expectedCode: 400,
    op: 'move',
    body: {
      path: '/private/hello.md',
      new_parent_path: '/teamspace',
    },
  },
  // mkdir operations
  {
    index: 12,
    expectedCode: 201,
    op: 'mkdir',
    body: { path: '/private/myfolder' },
  },
  {
    index: 13,
    expectedCode: 201,
    op: 'mkdir',
    body: { path: '/private/path/to/newfolder' },
  },
  {
    index: 14,
    expectedCode: 400,
    op: 'mkdir',
    body: { path: '/newfolder' },
  },
  {
    index: 15,
    expectedCode: 400,
    op: 'mkdir',
    body: { path: '/private/folder.md' },
  },
  {
    index: 16,
    expectedCode: 409,
    op: 'mkdir',
    body: { path: '/private/myfolder' },
  },
  // delete operations
  {
    index: 17,
    expectedCode: 200,
    op: 'delete',
    body: { path: '/private/path/to/hello.md' },
  },
  {
    index: 18,
    expectedCode: 409,
    op: 'delete',
    body: { path: '/private/path/to', recursive: false },
  },
  {
    index: 19,
    expectedCode: 404,
    op: 'delete',
    body: { path: '/private/nonexistent/file.md' },
  },
  {
    index: 20,
    expectedCode: 400,
    op: 'delete',
    body: { path: '/private' },
  },
  // rename operations
  {
    index: 21,
    expectedCode: 200,
    op: 'rename',
    body: { path: '/private/hello.md', new_name: 'renamed.md' },
  },
  {
    index: 22,
    expectedCode: 400,
    op: 'rename',
    body: { path: '/private/renamed.md', new_name: 'invalidname' },
  },
  {
    index: 23,
    expectedCode: 404,
    op: 'rename',
    body: { path: '/private/nonexistent.md', new_name: 'newname.md' },
  },
  // read operations
  {
    index: 24,
    expectedCode: 200,
    op: 'read',
    body: { path: '/private/renamed.md' },
  },
  {
    index: 25,
    expectedCode: 400,
    op: 'read',
    body: { path: '/private' },
  },
  {
    index: 26,
    expectedCode: 404,
    op: 'read',
    body: { path: '/private/nonexistent.md' },
  },
  // list operations
  {
    index: 27,
    expectedCode: 200,
    op: 'list',
    body: { path: '/private' },
  },
  {
    index: 28,
    expectedCode: 200,
    op: 'list',
    body: { path: '/private/path/to' },
  },
  {
    index: 29,
    expectedCode: 400,
    op: 'list',
    body: { path: '/private/renamed.md' },
  },
  {
    index: 30,
    expectedCode: 404,
    op: 'list',
    body: { path: '/private/nonexistent/path' },
  },
  // filter operations - using name_pattern to search
  {
    index: 31,
    expectedCode: 200,
    op: 'filter',
    body: { path: '/private', options: { name_pattern: 'hello' } },
  },
  {
    index: 32,
    expectedCode: 200,
    op: 'filter',
    body: { path: '/', options: { name_pattern: 'test' } },
  },
  // delete folder with children - should return 200 with recursive=true
  {
    index: 33,
    expectedCode: 200,
    op: 'delete',
    body: { path: '/private/path/to', recursive: true },
  },
  // delete empty folder without children - should succeed
  {
    index: 34,
    expectedCode: 200,
    op: 'delete',
    body: { path: '/private/myfolder' },
  },
];

describe('VFS (e2e)', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
  });

  test.each(testCases)('($index) $op $expectedCode', async (testCase) => {
    if (testCase.op === 'create') {
      if (!testCase.body?.path || !testCase.body?.content) {
        throw new Error('body is required');
      }
      const path: string = testCase.body.path;
      const content: string = testCase.body.content;
      if (testCase.expectedCode === 201) {
        const { fileInfo: fileInfoDto, resource: resourceDto } =
          await createResourceByPath(client, path, content);
        expect(resourceDto).toEqual({
          ...fileInfoDto,
          content: content,
        } as GetResponseDto);
      } else {
        await client
          .put(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
          .send({ path, content })
          .expect(testCase.expectedCode);
      }
    } else if (testCase.op === 'move') {
      if (!testCase.body?.path || !testCase.body?.new_parent_path) {
        throw new Error('body is required');
      }
      const path: string = testCase.body['path'];
      const new_parent_path: string = testCase.body['new_parent_path'];

      const response = await client
        .patch(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/move`)
        .send(testCase.body)
        .expect(testCase.expectedCode);
      if (testCase.expectedCode === 200) {
        const parsedPath = VFSService.parsePath(path);
        const resourceName: string = last(parsedPath.resourceNames);
        const fileInfoDto = plainToInstance(FileInfoDto, response.body);
        const newPath: string = `${new_parent_path}/${resourceName}`;
        expect(fileInfoDto.name).toEqual(resourceName);
        expect(fileInfoDto.path).toEqual(newPath);
      }
    } else if (testCase.op === 'mkdir') {
      if (!testCase.body?.path) {
        throw new Error('body is required');
      }
      const path: string = testCase.body.path;

      const response = await client
        .post(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/mkdir`)
        .send({ path })
        .expect(testCase.expectedCode);

      if (testCase.expectedCode === 201) {
        const parsedPath = VFSService.parsePath(path);
        const folderName: string = last(parsedPath.resourceNames);
        const fileInfoDto = plainToInstance(FileInfoDto, response.body);
        expect(fileInfoDto.name).toEqual(folderName);
        expect(fileInfoDto.path).toEqual(path);
        expect(fileInfoDto.isDir).toEqual(true);
      }
    } else if (testCase.op === 'delete') {
      if (!testCase.body?.path) {
        throw new Error('body is required');
      }
      const path: string = testCase.body.path;

      const query: Record<string, any> = { path };
      if (testCase.body.recursive) {
        query.recursive = 'true';
      }

      const response = await client
        .delete(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .query(query)
        .expect(testCase.expectedCode);

      if (testCase.expectedCode === 200) {
        // Delete returns FileInfoDto
        expect(response.body).toBeDefined();
      }
    } else if (testCase.op === 'rename') {
      if (!testCase.body?.path || !testCase.body?.new_name) {
        throw new Error('body is required');
      }
      const path: string = testCase.body.path;
      const new_name: string = testCase.body.new_name;

      const response = await client
        .patch(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/rename`)
        .send({ path, new_name })
        .expect(testCase.expectedCode);

      if (testCase.expectedCode === 200) {
        // Rename returns boolean true, but serialized as empty object {} in JSON
        expect(response.body).toBeDefined();
      }
    } else if (testCase.op === 'read') {
      if (!testCase.body?.path) {
        throw new Error('body is required');
      }
      const path: string = testCase.body.path;

      const response = await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/content`)
        .query({ path })
        .expect(testCase.expectedCode);

      if (testCase.expectedCode === 200) {
        const resourceDto = plainToInstance(GetResponseDto, response.body);
        expect(resourceDto.path).toEqual(path);
        expect(resourceDto.isDir).toEqual(false);
        expect(resourceDto.content).toBeDefined();
      }
    } else if (testCase.op === 'list') {
      if (!testCase.body?.path) {
        throw new Error('body is required');
      }
      const path: string = testCase.body.path;

      const response = await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/list`)
        .query({ path })
        .expect(testCase.expectedCode);

      if (testCase.expectedCode === 200) {
        expect(response.body).toHaveProperty('resources');
        expect(response.body).toHaveProperty('total');
        expect(response.body).toHaveProperty('path');
        expect(response.body.path).toEqual(path);
      }
    } else if (testCase.op === 'filter') {
      if (!testCase.body?.path) {
        throw new Error('body is required');
      }
      const path: string = testCase.body['path'];
      const options: Record<string, any> | undefined = testCase.body['options'];

      const query: Record<string, any> = { path };
      if (options) {
        query.options = JSON.stringify(options);
      }

      const response = await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/filter`)
        .query(query)
        .expect(testCase.expectedCode);

      if (testCase.expectedCode === 200) {
        expect(response.body).toHaveProperty('resources');
        expect(response.body).toHaveProperty('total');
      }
    }
  });
});
