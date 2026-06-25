import { plainToInstance } from 'class-transformer';
import { ListTagsResponseDto } from 'omniboxd/resource-tags/dto/list-tags-response.dto';
import { TagRenameResponseDto } from 'omniboxd/resource-tags/dto/tag-rename.response.dto';
import { TestClient } from 'test/test-client';

type Operation =
  | 'list_tags'
  | 'filter_tags'
  | 'rename_tag'
  | 'add_tag_to_resource'
  | 'remove_tag_from_resource'
  | 'create_resource';

interface TagTestCase {
  index: number;
  expectedCode: number;
  op: Operation;
  body?: {
    // create_resource — `key` identifies the resource for later add/remove ops
    key?: string;
    name?: string;
    content?: string;

    // add_tag_to_resource & remove_tag_from_resource
    resource_key?: string;
    tag_name?: string;

    // filter_tags & list_tags
    offset?: number;
    limit?: number;

    // filter_tags
    tag_pattern?: string;
    resource_cnt_less_or_equal_than?: number;
    resource_cnt_greater_or_equal_than?: number;

    // rename_tag
    old_name?: string;
    new_name?: string;
  };
  expected?: {
    total?: number;
    contains?: {
      name: string;
      cnt?: number;
    }[];
  };
}

const testCases: TagTestCase[] = [
  { index: 0, expectedCode: 200, op: 'list_tags', expected: { total: 0 } },
  {
    index: 1,
    expectedCode: 201,
    op: 'create_resource',
    body: { key: 'test', name: 'test.md', content: 'Hello World!' },
  },
  {
    index: 2,
    expectedCode: 201,
    op: 'add_tag_to_resource',
    body: { resource_key: 'test', tag_name: 'test' },
  },
  {
    index: 3,
    expectedCode: 200,
    op: 'list_tags',
    body: { offset: 0, limit: 10 },
    expected: { total: 1, contains: [{ name: 'test', cnt: 1 }] },
  },
  {
    index: 4,
    expectedCode: 200,
    op: 'filter_tags',
    body: { tag_pattern: 'test' },
    expected: { total: 1, contains: [{ name: 'test', cnt: 1 }] },
  },
  {
    index: 5,
    expectedCode: 200,
    op: 'filter_tags',
    body: { resource_cnt_greater_or_equal_than: 2 },
    expected: { total: 0, contains: [] },
  },
  {
    index: 6,
    expectedCode: 200,
    op: 'rename_tag',
    body: { old_name: 'test', new_name: 'new-tag' },
    expected: { total: 1 },
  },
  {
    index: 7,
    expectedCode: 200,
    op: 'list_tags',
    expected: { total: 1, contains: [{ name: 'new-tag', cnt: 1 }] },
  },
  {
    index: 8,
    expectedCode: 201,
    op: 'create_resource',
    body: { key: 'foo', name: 'foo.md', content: 'Foo' },
  },
  {
    index: 9,
    expectedCode: 201,
    op: 'add_tag_to_resource',
    body: { resource_key: 'foo', tag_name: 'foo' },
  },
  {
    index: 10,
    expectedCode: 200,
    op: 'list_tags',
    expected: {
      total: 2,
      contains: [
        { name: 'new-tag', cnt: 1 },
        { name: 'foo', cnt: 1 },
      ],
    },
  },
  {
    index: 11,
    expectedCode: 201,
    op: 'add_tag_to_resource',
    body: { resource_key: 'foo', tag_name: 'new-tag' },
  },
  {
    index: 12,
    expectedCode: 200,
    op: 'list_tags',
    expected: {
      total: 2,
      contains: [
        { name: 'new-tag', cnt: 2 },
        { name: 'foo', cnt: 1 },
      ],
    },
  },
  {
    index: 13,
    expectedCode: 200,
    op: 'remove_tag_from_resource',
    body: { resource_key: 'foo', tag_name: 'foo' },
  },
  {
    index: 14,
    expectedCode: 200,
    op: 'list_tags',
    expected: { total: 1, contains: [{ name: 'new-tag', cnt: 2 }] },
  },
];

describe('Tag (e2e)', () => {
  let client: TestClient;
  let privateRootId: string;
  const resourceIds: Record<string, string> = {};

  beforeAll(async () => {
    client = await TestClient.create();
    const rootsResponse = await client
      .get(`/internal/api/v1/namespaces/${client.namespace.id}/roots`)
      .expect(200);
    privateRootId = rootsResponse.body.private.id;
  });

  afterAll(async () => {
    await client.close();
  });

  function checkListTags(responseBody: object, testCase: TagTestCase) {
    const listTags = plainToInstance(ListTagsResponseDto, responseBody);
    expect(listTags.total).toEqual(testCase.expected?.total);
    for (const expectedTag of testCase.expected?.contains ?? []) {
      const tagDto = listTags.tags.find((tag) => tag.name === expectedTag.name);
      expect(tagDto).toBeDefined();
      if (tagDto) {
        expect(tagDto.name).toEqual(expectedTag.name);
        expect(tagDto.resourceCnt).toEqual(expectedTag.cnt);
      }
    }
  }

  test.each(testCases)('($index) $op $expectedCode', async (testCase) => {
    if (testCase.op === 'create_resource') {
      if (
        !testCase.body?.key ||
        !testCase.body.name ||
        !testCase.body.content
      ) {
        throw new Error('key, name and content required');
      }
      const response = await client
        .post(`/internal/api/v1/namespaces/${client.namespace.id}/resources`)
        .send({
          parentId: privateRootId,
          name: testCase.body.name,
          resourceType: 'doc',
          content: testCase.body.content,
        })
        .expect(testCase.expectedCode);
      resourceIds[testCase.body.key] = response.body.id;
    } else if (testCase.op === 'list_tags') {
      const query: Record<string, any> = {};
      Object.assign(query, testCase.body);
      const response = await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/tags`)
        .query(query)
        .expect(testCase.expectedCode);
      if (testCase.expectedCode === 200) {
        checkListTags(response.body, testCase);
      }
    } else if (testCase.op === 'filter_tags') {
      const query: Record<string, any> = {};
      Object.assign(query, testCase.body);
      const response = await client
        .get(`/internal/api/v1/namespaces/${client.namespace.id}/tags/filter`)
        .query(query)
        .expect(testCase.expectedCode);
      if (testCase.expectedCode === 200) {
        checkListTags(response.body, testCase);
      }
    } else if (testCase.op === 'rename_tag') {
      const response = await client
        .patch(`/internal/api/v1/namespaces/${client.namespace.id}/tags/rename`)
        .send({ ...testCase.body })
        .expect(testCase.expectedCode);
      if (testCase.expectedCode === 200) {
        const dto = plainToInstance(TagRenameResponseDto, response.body);
        expect(dto.affectedResourceCnt).toEqual(testCase.expected?.total);
      }
    } else if (testCase.op === 'add_tag_to_resource') {
      await client
        .post(`/internal/api/v1/namespaces/${client.namespace.id}/tags`)
        .send({
          resource_id: resourceIds[testCase.body!.resource_key!],
          tag_name: testCase.body!.tag_name,
        })
        .expect(testCase.expectedCode);
    } else if (testCase.op === 'remove_tag_from_resource') {
      await client
        .delete(`/internal/api/v1/namespaces/${client.namespace.id}/tags`)
        .send({
          resource_id: resourceIds[testCase.body!.resource_key!],
          tag_name: testCase.body!.tag_name,
        })
        .expect(testCase.expectedCode);
    }
  });
});
