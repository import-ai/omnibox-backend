import {
  APIKeyPermissionTarget,
  APIKeyPermissionType,
} from 'omniboxd/api-key/api-key.entity';
import { TestClient } from 'test/test-client';

describe('OpenTagController (e2e)', () => {
  let client: TestClient;
  let tagsApiKeyValue: string;
  let readOnlyTagsApiKeyValue: string;

  beforeAll(async () => {
    client = await TestClient.create();

    const tagsApiKeyResponse = await client
      .post('/api/v1/api-keys')
      .send({
        user_id: client.user.id,
        namespace_id: client.namespace.id,
        attrs: {
          root_resource_id: client.namespace.root_resource_id,
          permissions: [
            {
              target: APIKeyPermissionTarget.TAGS,
              permissions: [
                APIKeyPermissionType.CREATE,
                APIKeyPermissionType.READ,
              ],
            },
          ],
        },
      })
      .expect(201);
    tagsApiKeyValue = tagsApiKeyResponse.body.value;

    const readOnlyTagsApiKeyResponse = await client
      .post('/api/v1/api-keys')
      .send({
        user_id: client.user.id,
        namespace_id: client.namespace.id,
        attrs: {
          root_resource_id: client.namespace.root_resource_id,
          permissions: [
            {
              target: APIKeyPermissionTarget.TAGS,
              permissions: [APIKeyPermissionType.READ],
            },
          ],
        },
      })
      .expect(201);
    readOnlyTagsApiKeyValue = readOnlyTagsApiKeyResponse.body.value;
  });

  afterAll(async () => {
    await client.close();
  });

  it('should create and query tags with tag permissions', async () => {
    const createResponse = await client
      .request()
      .post('/open/api/v1/tags')
      .set('Authorization', `Bearer ${tagsApiKeyValue}`)
      .send({ name: 'open-tag' })
      .expect(201);

    expect(createResponse.body).toMatchObject({
      name: 'open-tag',
    });
    expect(createResponse.body.id).toBeDefined();

    const listResponse = await client
      .request()
      .get('/open/api/v1/tags?name=open')
      .set('Authorization', `Bearer ${readOnlyTagsApiKeyValue}`)
      .expect(200);

    expect(listResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: createResponse.body.id,
          name: 'open-tag',
        }),
      ]),
    );

    const byIdsResponse = await client
      .request()
      .get(`/open/api/v1/tags?ids=${createResponse.body.id}`)
      .set('Authorization', `Bearer ${readOnlyTagsApiKeyValue}`)
      .expect(200);

    expect(byIdsResponse.body).toEqual([
      expect.objectContaining({
        id: createResponse.body.id,
        name: 'open-tag',
      }),
    ]);
  });

  it('should reject tag creation without tags:create permission', async () => {
    await client
      .request()
      .post('/open/api/v1/tags')
      .set('Authorization', `Bearer ${readOnlyTagsApiKeyValue}`)
      .send({ name: 'no-create' })
      .expect(403);
  });
});
