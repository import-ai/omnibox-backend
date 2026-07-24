import { randomUUID } from 'node:crypto';

import { HttpStatus } from '@nestjs/common';
import { TestClient } from 'test/test-client';

describe('System notifications (e2e)', () => {
  let firstClient: TestClient;
  let secondClient: TestClient;

  beforeAll(async () => {
    firstClient = await TestClient.create();
    secondClient = new TestClient(firstClient.app);
    await secondClient.signUp();
  });

  afterAll(async () => {
    await firstClient.close();
  });

  it('shares one notification while keeping read state per user', async () => {
    const payload = {
      dedup_key: randomUUID(),
      title: 'System update',
      tags: ['System announcement', 'Product update'],
      content: '## New feature',
    };

    const created = await firstClient
      .request()
      .post('/internal/api/v1/system-notifications')
      .send(payload)
      .expect(HttpStatus.CREATED);

    const duplicate = await firstClient
      .request()
      .post('/internal/api/v1/system-notifications')
      .send(payload)
      .expect(HttpStatus.CREATED);
    expect(duplicate.body.id).toBe(created.body.id);

    const direct = await firstClient
      .request()
      .post('/internal/api/v1/notifications')
      .send({
        user_id: firstClient.user.id,
        title: 'Direct notification',
        content: 'Not part of system notification history',
        type: 'system',
      })
      .expect(HttpStatus.CREATED);

    const history = await firstClient
      .request()
      .get('/internal/api/v1/system-notifications?offset=0&limit=20')
      .expect(HttpStatus.OK);
    expect(history.body.list).toContainEqual({
      id: created.body.id,
      title: payload.title,
      content: payload.content,
      tags: payload.tags,
      created_at: expect.any(String),
    });
    expect(history.body.list).not.toContainEqual(
      expect.objectContaining({ id: direct.body.id }),
    );
    expect(history.body.pagination).toEqual({
      offset: 0,
      limit: 20,
      total: expect.any(Number),
    });

    for (const client of [firstClient, secondClient]) {
      const list = await client
        .get('/api/v1/notifications?status=unread&offset=0&limit=20')
        .expect(HttpStatus.OK);
      expect(list.body.list).toContainEqual(
        expect.objectContaining({
          id: created.body.id,
          notification_type: 'system',
          tags: payload.tags,
          status: 'unread',
        }),
      );
    }

    await firstClient
      .patch(`/api/v1/notifications/${created.body.id}`)
      .send({ status: 'read' })
      .expect(HttpStatus.OK);

    const firstCount = await firstClient
      .get('/api/v1/notifications/unread/count')
      .expect(HttpStatus.OK);
    const secondCount = await secondClient
      .get('/api/v1/notifications/unread/count')
      .expect(HttpStatus.OK);
    expect(firstCount.body.unread_count).toBe(0);
    expect(secondCount.body.unread_count).toBe(1);
  });
});
