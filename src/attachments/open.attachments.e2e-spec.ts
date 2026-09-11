import {
  APIKeyPermissionTarget,
  APIKeyPermissionType,
} from 'omniboxd/api-key/api-key.entity';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { TestClient } from 'test/test-client';

describe('OpenAttachmentsController (e2e)', () => {
  let client: TestClient;
  let resourceId: string;
  let siblingResourceId: string;
  let apiKeyValue: string;
  let readOnlyApiKeyValue: string;
  let shareId: string;

  beforeAll(async () => {
    client = await TestClient.create();

    const createResource = async (name: string) => {
      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send({
          name,
          namespaceId: client.namespace.id,
          resourceType: ResourceType.DOC,
          parentId: client.namespace.root_resource_id,
          content: `${name} content`,
          attrs: {},
        })
        .expect(201);
      return response.body.id as string;
    };

    resourceId = await createResource('Open attachment scope');
    siblingResourceId = await createResource('Open attachment sibling');

    const createApiKey = async (permissions: APIKeyPermissionType[]) => {
      const response = await client
        .post('/api/v1/api-keys')
        .send({
          user_id: client.user.id,
          namespace_id: client.namespace.id,
          attrs: {
            root_resource_id: resourceId,
            permissions: [
              { target: APIKeyPermissionTarget.RESOURCES, permissions },
            ],
          },
        })
        .expect(201);
      return response.body.value as string;
    };

    apiKeyValue = await createApiKey([
      APIKeyPermissionType.READ,
      APIKeyPermissionType.UPDATE,
    ]);
    readOnlyApiKeyValue = await createApiKey([APIKeyPermissionType.READ]);

    const shareResponse = await client
      .patch(
        `/api/v1/namespaces/${client.namespace.id}/resources/${resourceId}/share`,
      )
      .send({ enabled: true })
      .expect(200);
    shareId = shareResponse.body.id;
  });

  afterAll(async () => {
    await client.close();
  });

  it('supports the Open API attachment lifecycle within the API key root', async () => {
    const upload = await client
      .request()
      .post(`/open/api/v1/resources/${resourceId}/attachments`)
      .set('Authorization', `Bearer ${apiKeyValue}`)
      .attach('file[]', Buffer.from('open attachment'), 'open.txt')
      .expect(201);
    const attachmentId = upload.body.uploaded[0].link as string;

    const list = await client
      .request()
      .get(`/open/api/v1/resources/${resourceId}/attachments`)
      .set('Authorization', `Bearer ${apiKeyValue}`)
      .expect(200);
    expect(list.body).toMatchObject({
      total: 1,
      attachments: [
        {
          id: attachmentId,
          name: 'open.txt',
          content_type: 'text/plain',
          size: 15,
          download_url: `/open/api/v1/resources/${resourceId}/attachments/${attachmentId}`,
        },
      ],
    });

    const download = await client
      .request()
      .get(`/open/api/v1/resources/${resourceId}/attachments/${attachmentId}`)
      .set('Authorization', `Bearer ${apiKeyValue}`)
      .expect(200);
    expect(download.text).toBe('open attachment');

    await client
      .request()
      .delete(
        `/open/api/v1/resources/${resourceId}/attachments/${attachmentId}`,
      )
      .set('Authorization', `Bearer ${apiKeyValue}`)
      .expect(200);

    const emptyList = await client
      .request()
      .get(`/open/api/v1/resources/${resourceId}/attachments`)
      .set('Authorization', `Bearer ${apiKeyValue}`)
      .expect(200);
    expect(emptyList.body).toEqual({ attachments: [], total: 0 });
  });

  it('rejects writes with a read-only API key', async () => {
    await client
      .request()
      .post(`/open/api/v1/resources/${resourceId}/attachments`)
      .set('Authorization', `Bearer ${readOnlyApiKeyValue}`)
      .attach('file[]', Buffer.from('denied'), 'denied.txt')
      .expect(403);
  });

  it('rejects resources outside the API key root', async () => {
    await client
      .request()
      .get(`/open/api/v1/resources/${siblingResourceId}/attachments`)
      .set('Authorization', `Bearer ${apiKeyValue}`)
      .expect(403);
  });

  it('lists and downloads attachments through a share without write routes', async () => {
    const upload = await client
      .post(
        `/api/v1/namespaces/${client.namespace.id}/resources/${resourceId}/attachments`,
      )
      .attach('file[]', Buffer.from('shared attachment'), 'shared.txt')
      .expect(201);
    const attachmentId = upload.body.uploaded[0].link as string;

    const list = await client
      .request()
      .get(`/api/v1/shares/${shareId}/resources/${resourceId}/attachments`)
      .expect(200);
    expect(list.body.attachments[0]).toMatchObject({
      id: attachmentId,
      name: 'shared.txt',
    });

    const download = await client
      .request()
      .get(
        `/api/v1/shares/${shareId}/resources/${resourceId}/attachments/${attachmentId}`,
      )
      .expect(200);
    expect(download.text).toBe('shared attachment');

    await client
      .request()
      .post(`/api/v1/shares/${shareId}/resources/${resourceId}/attachments`)
      .attach('file[]', Buffer.from('denied'), 'denied.txt')
      .expect(404);
    await client
      .request()
      .delete(
        `/api/v1/shares/${shareId}/resources/${resourceId}/attachments/${attachmentId}`,
      )
      .expect(404);
  });

  it('rejects a resource outside the share scope', async () => {
    await client
      .request()
      .get(
        `/api/v1/shares/${shareId}/resources/${siblingResourceId}/attachments`,
      )
      .expect(404);
  });
});
