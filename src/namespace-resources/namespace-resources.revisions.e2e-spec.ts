import { HttpStatus } from '@nestjs/common';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { TestClient } from 'test/test-client';

describe('Resource revisions (e2e)', () => {
  let client: TestClient;
  let uid = 0;
  const uniqueName = (base: string) => `${base} ${++uid}`;

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client?.close();
  });

  const createDoc = async (name: string, content: string) => {
    const response = await client
      .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
      .send({
        name,
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: client.namespace.root_resource_id,
        content,
      })
      .expect(HttpStatus.CREATED);
    return response.body;
  };

  const listRevisions = (resourceId: string) =>
    client.get(
      `/api/v1/namespaces/${client.namespace.id}/resources/${resourceId}/revisions`,
    );

  it('lists only the current version for a newly created document', async () => {
    const resource = await createDoc(
      uniqueName('Revision create'),
      'Original content',
    );

    const response = await listRevisions(resource.id).expect(HttpStatus.OK);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      id: 'current',
      name: resource.name,
      is_current: true,
    });
    expect(new Date(response.body[0].created_at).getTime()).toBe(
      new Date(resource.updated_at).getTime(),
    );
  });

  it('keeps the original version timestamp after the first edit', async () => {
    const resource = await createDoc(
      uniqueName('Revision first edit'),
      'Original content',
    );

    await client
      .patch(
        `/api/v1/namespaces/${client.namespace.id}/resources/${resource.id}`,
      )
      .send({
        content: 'Updated content',
        namespaceId: client.namespace.id,
      })
      .expect(HttpStatus.OK);

    const response = await listRevisions(resource.id).expect(HttpStatus.OK);

    expect(response.body).toHaveLength(2);
    expect(response.body[0]).toMatchObject({
      id: 'current',
      is_current: true,
    });
    expect(response.body[1]).toMatchObject({
      name: resource.name,
      is_current: false,
    });
    expect(response.body[1].id).not.toBe('current');
    expect(new Date(response.body[1].created_at).getTime()).toBe(
      new Date(resource.created_at).getTime(),
    );
    expect(new Date(response.body[0].created_at).getTime()).toBeGreaterThan(
      new Date(resource.created_at).getTime(),
    );

    const historical = await client
      .get(
        `/api/v1/namespaces/${client.namespace.id}/resources/${resource.id}/revisions/${response.body[1].id}`,
      )
      .expect(HttpStatus.OK);
    expect(historical.body.content).toBe('Original content');
  });

  it('restores a historical version as a new current version', async () => {
    const resource = await createDoc(
      uniqueName('Revision restore'),
      'Original content',
    );

    await client
      .patch(
        `/api/v1/namespaces/${client.namespace.id}/resources/${resource.id}`,
      )
      .send({
        content: 'Updated content',
        namespaceId: client.namespace.id,
      })
      .expect(HttpStatus.OK);

    const beforeRestore = await listRevisions(resource.id).expect(
      HttpStatus.OK,
    );
    const originalRevisionId = beforeRestore.body[1].id;

    await client
      .post(
        `/api/v1/namespaces/${client.namespace.id}/resources/${resource.id}/revisions/${originalRevisionId}/restore`,
      )
      .expect(HttpStatus.CREATED);

    const restored = await client
      .get(`/api/v1/namespaces/${client.namespace.id}/resources/${resource.id}`)
      .expect(HttpStatus.OK);
    expect(restored.body.content).toBe('Original content');

    const afterRestore = await listRevisions(resource.id).expect(HttpStatus.OK);
    expect(afterRestore.body[0]).toMatchObject({
      id: 'current',
      is_current: true,
    });
    expect(
      afterRestore.body.some(
        (revision: { content?: string; is_current: boolean; id: string }) =>
          !revision.is_current && revision.id !== 'current',
      ),
    ).toBe(true);
  });
});
