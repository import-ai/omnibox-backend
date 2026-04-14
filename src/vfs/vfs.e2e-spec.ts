import { TestClient } from 'test/test-client';
import { createResourceByPath } from 'test/vfs-utils';
import { FileInfoDto } from 'omniboxd/vfs/dto/file-info.dto';
import { plainToInstance } from 'class-transformer';
import { VfsService } from 'omniboxd/vfs/vfs.service';
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
  body: {
    path?: string;

    create_parents?: boolean;

    content?: string;

    new_parent_path?: string;

    new_name?: string;

    options?: {
      name_pattern?: string;
    };

    recursive?: boolean;
  };
  expected?: {
    content?: string;
    expected_names?: string[];
  };
}
const testCases: TestCase[] = [
  // create operations
  {
    index: 0,
    expectedCode: 201,
    op: 'create',
    body: {
      path: '/private/hello',
      content: 'hello',
    },
    expected: {
      content: 'hello',
    },
  },
  /**
   * /private/hello
   */
  {
    index: 1,
    expectedCode: 201,
    op: 'create',
    body: {
      path: '/teamspace/hi.md',
      content: 'hi',
    },
    expected: {
      content: 'hello',
    },
  },
  /**
   * /private/hello
   * /teamspace/hi.md
   */
  {
    index: 2,
    expectedCode: 404,
    op: 'create',
    body: { path: '/private/path/to/hello.md', content: 'hello' },
  },
  {
    index: 3,
    expectedCode: 404,
    op: 'mkdir',
    body: {
      path: '/private/path/to',
    },
  },
  {
    index: 4,
    expectedCode: 201,
    op: 'mkdir',
    body: {
      path: '/private/path/to',
      create_parents: true,
    },
  },
  /**
   * /private/hello
   * /teamspace/hi.md
   * /private/path/to
   */
  {
    index: 5,
    expectedCode: 201,
    op: 'create',
    body: { path: '/private/path/to/hello', content: 'hello' },
  },
  /**
   * /private/hello
   * /teamspace/hi.md
   * /private/path/to/hello
   */
  {
    index: 6,
    expectedCode: 404,
    op: 'create',
    body: { path: '/teamspace/path/to/hi', content: 'hi' },
  },
  {
    index: 7,
    expectedCode: 409,
    op: 'create',
    body: { path: '/private/hello', content: 'hello' },
  },
  {
    index: 8,
    expectedCode: 409,
    op: 'create',
    body: { path: '/teamspace/hi.md', content: 'hi' },
  },
  {
    index: 9,
    expectedCode: 400,
    op: 'create',
    body: { path: '/hello.md', content: 'hello' },
  },
  {
    index: 10,
    expectedCode: 400,
    op: 'create',
    body: { path: '/foo/hello.md', content: 'hello' },
  },
  // move operations
  {
    index: 11,
    expectedCode: 404,
    op: 'move',
    body: {
      path: '/private/hello.md',
      new_parent_path: '/private/path/to/unexists/',
    },
  },
  {
    index: 12,
    expectedCode: 404,
    op: 'move',
    body: {
      path: '/private/path/to/unexists/unexists.md',
      new_parent_path: '/private/',
    },
  },
  {
    index: 13,
    expectedCode: 400,
    op: 'move',
    body: {
      path: '/private/hello',
      new_parent_path: '/',
    },
  },
  {
    index: 14,
    expectedCode: 400,
    op: 'move',
    body: {
      path: '/private',
      new_parent_path: '/teamspace',
    },
  },
  {
    index: 15,
    expectedCode: 200,
    op: 'move',
    body: {
      path: '/private/hello',
      new_parent_path: '/teamspace',
    },
  },
  /**
   * /teamspace/hello
   * /teamspace/hi.md
   * /private/path/to/hello
   */
  {
    index: 16,
    expectedCode: 200,
    op: 'list',
    body: {
      path: '/teamspace',
    },
    expected: {
      expected_names: ['hello', 'hi.md'],
    },
  },
  {
    index: 17,
    expectedCode: 200,
    op: 'move',
    body: {
      path: '/teamspace/hi.md',
      new_parent_path: '/private',
    },
  },
  /**
   * /teamspace/hello
   * /private/hi.md
   * /private/path/to/hello
   */
  {
    index: 18,
    expectedCode: 200,
    op: 'move',
    body: {
      path: '/private/path',
      new_parent_path: '/private/hi.md',
    },
  },
  /**
   * /teamspace/hello
   * /private/hi.md/path/to/hello
   */
  {
    index: 19,
    expectedCode: 404,
    op: 'move',
    body: {
      path: '/private/hello',
      new_parent_path: '/teamspace/path',
    },
  },
  {
    index: 20,
    expectedCode: 200,
    op: 'move',
    body: {
      path: '/private/hi.md/path/to',
      new_parent_path: '/teamspace',
    },
  },
  /**
   * /teamspace/hello
   * /teamspace/to/hello
   * /private/hi.md/path
   */
  {
    index: 21,
    expectedCode: 200,
    op: 'list',
    body: {
      path: '/teamspace',
    },
    expected: {
      expected_names: ['hello', 'to'],
    },
  },
  {
    index: 22,
    expectedCode: 200,
    op: 'move',
    body: {
      path: '/teamspace/to/hello',
      new_parent_path: '/private',
    },
  },
  /**
   * /teamspace/hello
   * /teamspace/to
   * /private/hi.md/path
   * /private/hello
   */
  {
    index: 23,
    expectedCode: 200,
    op: 'list',
    body: {
      path: '/private',
    },
    expected: {
      expected_names: ['hello', 'hi.md'],
    },
  },
  {
    index: 24,
    expectedCode: 200,
    op: 'move',
    body: {
      path: '/teamspace/hello',
      new_parent_path: '/private/hi.md',
    },
  },
  /**
   * /teamspace/to
   * /private/hi.md/path
   * /private/hi.md/hello
   * /private/hello
   */
  {
    index: 25,
    expectedCode: 200,
    op: 'list',
    body: {
      path: '/private/hi.md',
    },
    expected: {
      expected_names: ['hello', 'path'],
    },
  },
  {
    index: 26,
    expectedCode: 200,
    op: 'move',
    body: {
      path: '/private/hi.md/hello',
      new_parent_path: '/teamspace/to',
    },
  },
  /**
   * /teamspace/to/hello
   * /private/hi.md/path
   * /private/hello
   */
  {
    index: 27,
    expectedCode: 200,
    op: 'move',
    body: {
      path: '/private/hello',
      new_parent_path: '/teamspace',
    },
  },
  /**
   * /teamspace/to/hello
   * /private/hi.md/path
   * /teamspace/hello
   */
  // mkdir operations
  {
    index: 28,
    expectedCode: 201,
    op: 'mkdir',
    body: { path: '/private/myfolder' },
  },
  /**
   * /teamspace/to/hello
   * /private/hi.md/path
   * /teamspace/hello
   * /private/myfolder
   */
  {
    index: 29,
    expectedCode: 409,
    op: 'mkdir',
    body: { path: '/private/myfolder' },
  },
  {
    index: 30,
    expectedCode: 201,
    op: 'mkdir',
    body: { path: '/teamspace/to/hello/newfolder' },
  },
  /**
   * /teamspace/to/hello/newfolder
   * /private/hi.md/path
   * /teamspace/hello
   * /private/myfolder
   */
  {
    index: 31,
    expectedCode: 400,
    op: 'mkdir',
    body: { path: '/' },
  },
  {
    index: 32,
    expectedCode: 400,
    op: 'mkdir',
    body: { path: '/newfolder' },
  },
  {
    index: 33,
    expectedCode: 409, // /teamspace/to has children
    op: 'delete',
    body: { path: '/teamspace/to' },
  },
  {
    index: 34,
    expectedCode: 200,
    op: 'delete',
    body: { path: '/teamspace/to/hello/newfolder' },
  },
  /**
   * /teamspace/to/hello
   * /private/hi.md/path
   * /teamspace/hello
   * /private/myfolder
   */
  {
    index: 35,
    expectedCode: 200,
    op: 'list',
    body: { path: '/teamspace/to/hello' },
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
        const parsedPath = VfsService.parsePath(path);
        const resourceName: string = last(parsedPath.resourceNames);
        const fileInfoDto = plainToInstance(FileInfoDto, response.body);
        const newPath: string = `${new_parent_path}/${resourceName}`;
        expect(fileInfoDto.name).toEqual(resourceName);
        expect(fileInfoDto.path).toEqual(newPath);
      }
    } else if (testCase.op === 'mkdir') {
      if (!testCase.body?.path) {
        throw new Error('path is required');
      }
      const response = await client
        .put(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/mkdir`)
        .send(testCase.body)
        .expect(testCase.expectedCode);

      if (testCase.expectedCode === 201) {
        const parsedPath = VfsService.parsePath(testCase.body.path);
        const folderName: string = last(parsedPath.resourceNames);
        const fileInfoDto = plainToInstance(FileInfoDto, response.body);
        expect(fileInfoDto.name).toEqual(folderName);
        expect(fileInfoDto.path).toEqual(testCase.body.path);
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
        .send(query)
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
        expect(resourceDto.content).toBeDefined();
      }
    } else if (testCase.op === 'list') {
      if (!testCase.body) {
        throw new Error('body is required');
      }

      const response = await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/list`)
        .query(testCase.body)
        .expect(testCase.expectedCode);

      if (testCase.expectedCode === 200) {
        expect(response.body).toHaveProperty('resources');
        expect(response.body).toHaveProperty('total');
        expect(response.body).toHaveProperty('parent_path');
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
