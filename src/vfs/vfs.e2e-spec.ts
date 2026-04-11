import { TestClient } from 'test/test-client';
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
  | 'rename';

interface TestCase {
  index: number;
  expectedCode: number;
  op: Operation;
  body?: Record<string, any>;
}

const testCases: TestCase[] = [
  {
    index: 0,
    expectedCode: 201,
    op: 'create',
    body: {
      path: '/private/hello.md',
    },
  },
  {
    index: 1,
    expectedCode: 201,
    op: 'create',
    body: { path: '/private/path/to/hello.md' },
  },
  {
    index: 2,
    expectedCode: 400,
    op: 'create',
    body: { path: '/private/hello' },
  },
  {
    index: 3,
    expectedCode: 400,
    op: 'create',
    body: { path: '/private/path/to/hello' },
  },
  { index: 4, expectedCode: 400, op: 'create', body: { path: '/hello.md' } },
  {
    index: 5,
    expectedCode: 400,
    op: 'create',
    body: { path: '/foo/hello.md' },
  },
  {
    index: 6,
    expectedCode: 409,
    op: 'create',
    body: { path: '/private/hello.md' },
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
];

describe('VFS (e2e)', () => {
  let client: TestClient;
  const resource = { name: 'hello', content: 'Hello World!' };

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
  });

  async function getByPath(path: string): Promise<GetResponseDto> {
    const response = await client
      .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
      .query({ path })
      .expect(200);
    return plainToInstance(GetResponseDto, response.body);
  }

  test.each(testCases)('($index) $op $expectedCode', async (testCase) => {
    if (testCase.op === 'create') {
      if (!testCase.body) {
        throw new Error('body is required');
      }
      const path: string = testCase.body['path'];
      const content: string = testCase.body['content'] || resource.content;
      const response = await client
        .put(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .send({ path, content })
        .expect(testCase.expectedCode);
      if (testCase.expectedCode === 201) {
        const parsedPath = VFSService.parsePath(path);
        const resourceName: string = last(parsedPath.resourceNames);
        const fileInfoDto = plainToInstance(FileInfoDto, response.body);
        expect(fileInfoDto.name).toEqual(resourceName);
        expect(fileInfoDto.path).toEqual(path);
        expect(fileInfoDto.isDir).toEqual(false);
        const resourceDto = await getByPath(path);
        expect(resourceDto).toEqual({
          ...fileInfoDto,
          content: resource.content,
        } as GetResponseDto);
      }
    } else if (testCase.op === 'move') {
      if (!testCase.body) {
        throw new Error('body is required');
      }
      const path: string = testCase.body['path'];
      const new_parent_path: string = testCase.body['new_parent_path'];

      const response = await client
        .patch(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/move`)
        .send({
          path,
          new_parent_path,
        })
        .expect(testCase.expectedCode);
      if (testCase.expectedCode === 200) {
        const parsedPath = VFSService.parsePath(path);
        const resourceName: string = last(parsedPath.resourceNames);
        const fileInfoDto = plainToInstance(FileInfoDto, response.body);
        const newPath: string = `${new_parent_path}/${resourceName}`;
        expect(fileInfoDto.name).toEqual(resourceName);
        expect(fileInfoDto.path).toEqual(newPath);
      }
    }
  });
});
