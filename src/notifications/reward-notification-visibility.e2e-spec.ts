import { HttpStatus } from '@nestjs/common';
import { TestClient } from 'test/test-client';

describe('Reward notification namespace visibility (e2e)', () => {
  let client: TestClient;
  let otherClient: TestClient;
  const notices: Record<string, string> = {};

  beforeAll(async () => {
    client = await TestClient.create();
    otherClient = new TestClient(client.app);
    await otherClient.signUp();
    for (const [key, receiver, tags] of [
      [
        'ordinary',
        { user_id: client.user.id, namespace_id: 'notice-A' },
        ['marketing'],
      ],
      [
        'reward',
        { user_id: client.user.id, namespace_id: 'notice-A' },
        ['activity_reward'],
      ],
      ['personal', { user_id: client.user.id }, []],
      ['broadcast', { namespace_id: 'notice-A' }, []],
      [
        'otherReward',
        { user_id: otherClient.user.id, namespace_id: 'notice-A' },
        ['activity_reward'],
      ],
    ] as const) {
      const response = await client
        .request()
        .post('/internal/api/v1/notifications')
        .send({ ...receiver, title: key, type: 'activity', tags })
        .expect(HttpStatus.CREATED);
      notices[key] = response.body.id;
    }
  });

  afterAll(async () => {
    await client.close();
  });

  it('only adds own rewards to the existing namespace and personal visibility', async () => {
    for (const scope of ['', '&namespaceId=notice-B']) {
      const response = await client
        .get(`/api/v1/notifications?status=all${scope}`)
        .expect(HttpStatus.OK);
      expect(
        response.body.list.map((item: { id: string }) => item.id).sort(),
      ).toEqual([notices.reward, notices.personal].sort());
    }
    const inOriginalNamespace = await client
      .get('/api/v1/notifications?namespaceId=notice-A')
      .expect(HttpStatus.OK);
    expect(
      inOriginalNamespace.body.list
        .map((item: { id: string }) => item.id)
        .sort(),
    ).toEqual(
      [
        notices.ordinary,
        notices.reward,
        notices.personal,
        notices.broadcast,
      ].sort(),
    );
  });

  it('does not allow another namespace or user to read unrelated personal details', async () => {
    await client
      .get(`/api/v1/notifications/${notices.ordinary}?namespaceId=notice-B`)
      .expect(HttpStatus.NOT_FOUND);
    await client
      .get(`/api/v1/notifications/${notices.otherReward}?namespaceId=notice-B`)
      .expect(HttpStatus.NOT_FOUND);
    await client
      .get(`/api/v1/notifications/${notices.reward}?namespaceId=notice-B`)
      .expect(HttpStatus.OK);
    await client
      .patch(`/api/v1/notifications/${notices.ordinary}?namespaceId=notice-B`)
      .send({ status: 'read' })
      .expect(HttpStatus.NOT_FOUND);
  });

  it('clears own rewards without marking another namespace ordinary notices read', async () => {
    await client
      .post('/api/v1/notifications/unread/clear?namespaceId=notice-B')
      .send({ status: 'unread' })
      .expect(HttpStatus.OK);
    const original = await client
      .get(`/api/v1/notifications/${notices.ordinary}?namespaceId=notice-A`)
      .expect(HttpStatus.OK);
    expect(original.body.status).toBe('unread');
    const reward = await client
      .get(`/api/v1/notifications/${notices.reward}?namespaceId=notice-B`)
      .expect(HttpStatus.OK);
    expect(reward.body.status).toBe('read');
    const otherReward = await otherClient
      .get(`/api/v1/notifications/${notices.otherReward}?namespaceId=notice-A`)
      .expect(HttpStatus.OK);
    expect(otherReward.body.status).toBe('unread');
    const count = await client
      .get('/api/v1/notifications/unread/count?namespaceId=notice-B')
      .expect(HttpStatus.OK);
    expect(count.body.unread_count).toBe(0);
  });
});
