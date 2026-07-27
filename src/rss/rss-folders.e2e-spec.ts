import { HttpStatus } from '@nestjs/common';
import { TestClient } from 'test/test-client';

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example RSS Feed</title>
    <link>https://example.com</link>
    <description>Example</description>
  </channel>
</rss>`;

const HTML_BODY = '<!doctype html><html><body>not a feed</body></html>';

// Feed URLs containing 'invalid' return HTML; everything else looks like RSS.
global.fetch = jest.fn().mockImplementation((url) => {
  const body = String(url).includes('invalid') ? HTML_BODY : RSS_XML;
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(body),
  });
}) as jest.MockedFunction<typeof fetch>;

describe('RssFoldersController (e2e)', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
  });

  const createFolder = (body: Record<string, any>) =>
    client
      .post(`/api/v1/namespaces/${client.namespace.id}/rss-folders`)
      .send(body);

  it('returns basic entitlements with a 1-link limit', async () => {
    const response = await client
      .get(`/api/v1/namespaces/${client.namespace.id}/rss-folders/entitlements`)
      .expect(200);
    expect(response.body).toEqual({ tier: 'basic', link_limit: 1 });
  });

  it('creates an rss folder and uses the feed title as default link name', async () => {
    const response = await createFolder({
      name: 'My Subscriptions',
      parent_id: client.namespace.root_resource_id,
      links: [{ url: 'https://example.com/feed' }],
    }).expect(201);

    expect(response.body.resource.name).toBe('My Subscriptions');
    expect(response.body.resource.resource_type).toBe('rss_folder');
    expect(response.body.links).toHaveLength(1);
    expect(response.body.links[0]).toMatchObject({
      index: 0,
      url: 'https://example.com/feed',
      name: 'Example RSS Feed',
    });
  });

  it('keeps the user-provided link name', async () => {
    const response = await createFolder({
      name: 'Named Subscriptions',
      parent_id: client.namespace.root_resource_id,
      links: [{ url: 'https://example.com/feed', name: 'Custom Name' }],
    }).expect(201);

    expect(response.body.links[0].name).toBe('Custom Name');
  });

  it('rejects more links than the basic tier allows', async () => {
    const response = await createFolder({
      name: 'Too Many Links',
      parent_id: client.namespace.root_resource_id,
      links: [
        { url: 'https://example.com/feed1' },
        { url: 'https://example.com/feed2' },
      ],
    }).expect(HttpStatus.UNPROCESSABLE_ENTITY);

    expect(response.body.code).toBe('rss_folder_link_limit_exceeded');
  });

  it('rejects links that are not rss feeds with per-link indices', async () => {
    const response = await createFolder({
      name: 'Invalid Feed',
      parent_id: client.namespace.root_resource_id,
      links: [{ url: 'https://example.com/invalid' }],
    }).expect(HttpStatus.UNPROCESSABLE_ENTITY);

    expect(response.body.code).toBe('rss_feed_invalid');
    expect(response.body.failed).toEqual([
      { index: 0, url: 'https://example.com/invalid' },
    ]);
  });

  it('gets, updates and deletes an rss folder', async () => {
    const created = (
      await createFolder({
        name: 'Lifecycle',
        parent_id: client.namespace.root_resource_id,
        links: [{ url: 'https://example.com/feed' }],
      }).expect(201)
    ).body;
    const resourceId = created.resource.id;
    const base = `/api/v1/namespaces/${client.namespace.id}/rss-folders/${resourceId}`;

    const fetched = (await client.get(`${base}/config`).expect(200)).body;
    expect(fetched.resource.id).toBe(resourceId);
    expect(fetched.links).toHaveLength(1);

    const renamed = (
      await client.patch(`${base}/config`).send({ name: 'Renamed' }).expect(200)
    ).body;
    expect(renamed.resource.name).toBe('Renamed');
    expect(renamed.links).toHaveLength(1);

    const relinked = (
      await client
        .patch(`${base}/config`)
        .send({ links: [{ url: 'https://example.com/other', name: 'Other' }] })
        .expect(200)
    ).body;
    expect(relinked.links).toEqual([
      expect.objectContaining({
        index: 0,
        url: 'https://example.com/other',
        name: 'Other',
      }),
    ]);

    await client.delete(base).expect(200);
    await client.get(`${base}/config`).expect(HttpStatus.NOT_FOUND);
  });

  it('rejects creating resources inside an rss folder', async () => {
    const created = (
      await createFolder({
        name: 'No Children',
        parent_id: client.namespace.root_resource_id,
        links: [{ url: 'https://example.com/feed' }],
      }).expect(201)
    ).body;

    const response = await client
      .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
      .send({
        name: 'child doc',
        resourceType: 'doc',
        parentId: created.resource.id,
      })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);

    expect(response.body.code).toBe('rss_folder_cannot_be_parent');
  });

  it('rejects an invalid url at dto validation', async () => {
    await createFolder({
      name: 'Bad URL',
      parent_id: client.namespace.root_resource_id,
      links: [{ url: 'not-a-url' }],
    }).expect(HttpStatus.BAD_REQUEST);
  });
});
