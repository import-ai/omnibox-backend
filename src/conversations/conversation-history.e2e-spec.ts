import { randomUUID } from 'node:crypto';

import { Conversation } from 'omniboxd/conversations/entities/conversation.entity';
import {
  Message,
  MessageStatus,
  OpenAIMessageRole,
} from 'omniboxd/messages/entities/message.entity';
import { TestClient } from 'test/test-client';
import { DataSource } from 'typeorm';

describe('Paginated conversation history', () => {
  let client: TestClient;
  let database: DataSource;
  let conversation: Conversation;
  let url: string;
  const ids: string[] = [];
  beforeAll(async () => {
    client = await TestClient.create();
    database = client.app.get(DataSource);
    conversation = await database.getRepository(Conversation).save({
      userId: client.user.id,
      namespaceId: client.namespace.id,
      title: 'History test',
    });
    url = `/api/v1/namespaces/${client.namespace.id}/conversations/${conversation.id}`;
    let parentId: string | null = null;
    for (let turn = 0; turn < 12; turn++) {
      for (const role of [
        OpenAIMessageRole.USER,
        OpenAIMessageRole.ASSISTANT,
      ]) {
        const id = randomUUID();
        const saved = await database.getRepository(Message).save({
          id,
          userId: client.user.id,
          conversationId: conversation.id,
          parentId,
          status: MessageStatus.SUCCESS,
          createdAt: new Date(1700000000000 + ids.length * 1000),
          message: {
            role,
            content:
              role === OpenAIMessageRole.USER
                ? `Question ${turn}`
                : `Answer ${turn} [[1]]`,
            reasoning_content:
              role === OpenAIMessageRole.ASSISTANT
                ? 'Large reasoning'
                : undefined,
          },
          attrs: {
            context: { secret: 'never returned' },
            ...(turn === 0 && role === OpenAIMessageRole.ASSISTANT
              ? {
                  citations: [
                    {
                      id: 'C1-test',
                      title: 'Source',
                      link: 'https://example.com',
                      snippet: 'Large snippet',
                    },
                  ],
                }
              : {}),
          },
        });
        ids.push(saved.id);
        parentId = saved.id;
      }
    }
  });
  afterAll(async () => {
    if (database && conversation) {
      await database
        .getRepository(Message)
        .delete({ conversationId: conversation.id });
      await database.getRepository(Conversation).delete(conversation.id);
    }
    await client?.close();
  });
  it('pages complete turns, keeps citations stable, and lazily reads details', async () => {
    const first = (await client.get(`${url}/messages`).expect(200)).body;
    expect(first.total).toBe(12);
    expect(Object.keys(first.mapping)).toHaveLength(20);
    expect(first.shareable_total).toBe(12);
    expect(first.has_more).toBe(true);
    expect(first.mapping[ids[23]].message.reasoning_content).toBeUndefined();
    expect(first.mapping[ids[23]].has_reasoning).toBe(true);
    expect(first.mapping[ids[23]].attrs.context).toBeUndefined();
    expect(first.citations[0]).toMatchObject({
      index: 0,
      source_message_id: ids[1],
    });
    expect(first.citations[0].snippet).toBeUndefined();
    const older = (
      await client
        .get(`${url}/messages?offset=10&branch_leaf_id=${first.branch_leaf_id}`)
        .expect(200)
    ).body;
    expect(Object.keys(older.mapping)).toHaveLength(4);
    expect(older.has_more).toBe(false);
    const details = (
      await client
        .get(`${url}/messages/details?ids=${ids[1]},${ids[23]}`)
        .expect(200)
    ).body;
    expect(details.mapping[ids[1]].attrs.citations[0].snippet).toBe(
      'Large snippet',
    );
    expect(details.mapping[ids[23]].message.reasoning_content).toBe(
      'Large reasoning',
    );
    expect(details.mapping[ids[23]].attrs.context).toBeUndefined();
    const legacy = (await client.get(url).expect(200)).body;
    expect(Object.keys(legacy.mapping)).toHaveLength(24);
    expect(legacy.mapping[ids[23]].message.reasoning_content).toBe(
      'Large reasoning',
    );
  });
  it('validates bounds, ownership and message membership', async () => {
    await client.get(`${url}/messages?limit=21`).expect(400);
    await client.get(`${url}/messages?offset=-1`).expect(400);
    await client
      .get(`${url}/messages?branch_leaf_id=${randomUUID()}`)
      .expect(400);
    await client.get(`${url}/messages/details?ids=${randomUUID()}`).expect(400);
    await client
      .get(`${url}/messages/details?ids=${ids[0]},${ids[0]}`)
      .expect(400);
    await client
      .get(
        `/api/v1/namespaces/${client.namespace.id}/conversations/${randomUUID()}/messages`,
      )
      .expect(403);
  });
  it('shares all completed answers on the pinned branch and excludes selected answers', async () => {
    const response = await client
      .post(`/api/v1/namespaces/${client.namespace.id}/conversation-shares`)
      .send({
        conversation_id: conversation.id,
        channel: 'copy_link',
        select_all: true,
        branch_leaf_id: ids[23],
        excluded_answer_ids: [ids[23]],
      })
      .expect(201);
    const groups = await database.query(
      'SELECT ordinal FROM conversation_share_groups WHERE share_id = $1',
      [response.body.id],
    );
    expect(groups).toHaveLength(11);
    await client
      .post(`/api/v1/namespaces/${client.namespace.id}/conversation-shares`)
      .send({
        conversation_id: conversation.id,
        channel: 'copy_link',
        select_all: true,
        branch_leaf_id: ids[23],
        answer_ids: [ids[1]],
      })
      .expect(400);
    await database.query('DELETE FROM conversation_shares WHERE id = $1', [
      response.body.id,
    ]);
  });
  it('keeps history readable when saved text has a malformed citation URI', async () => {
    await database.getRepository(Message).update(ids[23], {
      message: {
        role: OpenAIMessageRole.ASSISTANT,
        content: 'Explain [[1]](C%)',
      },
    });
    const page = (await client.get(`${url}/messages`).expect(200)).body;
    expect(page.mapping[ids[23]].message.content).toBe('Explain [[1]](C%)');
  });
  it('keeps approval payloads when a checkpoint has persisted success status', async () => {
    const repository = database.getRepository(Message);
    const message = await repository.findOneByOrFail({ id: ids[23] });
    const originalMessage = message.message;
    const originalAttrs = message.attrs;
    const toolCalls = [
      {
        id: 'pending-edit',
        type: 'function',
        function: { name: 'edit_resource', arguments: '{}' },
      },
    ];
    const interrupts = [
      {
        id: 'approval',
        value: {
          action_requests: [
            { name: 'edit_resource', args: { resource_id: 'memory' } },
          ],
        },
      },
    ];
    await repository.save({
      ...message,
      message: { ...originalMessage, tool_calls: toolCalls },
      attrs: { ...originalAttrs, tool_call: { interrupts } },
    });
    try {
      const page = (await client.get(`${url}/messages`).expect(200)).body;
      expect(page.mapping[message.id].message.tool_calls).toEqual(toolCalls);
      expect(page.mapping[message.id].attrs.tool_call.interrupts).toEqual(
        interrupts,
      );
      expect(page.mapping[message.id].attrs.context).toBeUndefined();
    } finally {
      await repository.save({
        ...message,
        message: originalMessage,
        attrs: originalAttrs,
      });
    }
  });
});
