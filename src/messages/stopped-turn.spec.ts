import { beginAnswerTiming } from './answer-timing';
import {
  Message,
  MessageStatus as S,
  OpenAIMessageRole as R,
} from './entities/message.entity';
import { MessagesService } from './messages.service';

function fixture(rows: Message[]) {
  const repo = {
    create: (value: any) => value,
    find: jest.fn(() => Promise.resolve(rows.map((m) => structuredClone(m)))),
    findOneOrFail: jest.fn(({ where }) =>
      Promise.resolve(structuredClone(rows.find((m) => m.id === where.id)!)),
    ),
    findOneByOrFail: jest.fn(({ id }) =>
      Promise.resolve(structuredClone(rows.find((m) => m.id === id)!)),
    ),
    findOneBy: jest.fn(({ id }) =>
      Promise.resolve(structuredClone(rows.find((m) => m.id === id) ?? null)),
    ),
    save: jest.fn((message: Message) => {
      const i = rows.findIndex((m) => m.id === message.id);
      if (i >= 0) rows[i] = structuredClone(message);
      else rows.push(message);
      return Promise.resolve(message);
    }),
  };
  const manager: any = { getRepository: () => repo, save: repo.save };
  manager.transaction = (fn: any) => Promise.resolve(fn(manager));
  const service = new MessagesService(
    repo as any,
    {} as any,
    { manager, transaction: manager.transaction } as any,
    {} as any,
    {} as any,
    { t: (key: string) => key } as any,
  );
  return { service, repo, rows };
}
function row(
  id: string,
  parentId: string | null,
  role: R,
  status = S.SUCCESS,
  attrs: any = {},
  toolCallId?: string,
): Message {
  return {
    id,
    parentId,
    conversationId: 'c',
    userId: null,
    createdAt: new Date(Number(id.replace(/\D/g, '')) || 1),
    status,
    attrs,
    message: { role, ...(toolCallId ? { tool_call_id: toolCallId } : {}) },
    inputTokenCached: 0,
    inputTokenUncached: 0,
    outputToken: 0,
  } as Message;
}

describe('stopped turn persistence', () => {
  it('atomically freezes the leaf timing on a remote stop, including the EOS to DONE gap', async () => {
    const rows = [
      row('q', null, R.USER),
      row('a', 'q', R.ASSISTANT, S.SUCCESS, {
        turn_id: 'q',
        turn_run_id: 'run',
        answer_timing: beginAnswerTiming('run', [], 1000),
      }),
    ];
    const { service } = fixture(rows);
    const clock = jest.spyOn(Date, 'now').mockReturnValue(4000);
    try {
      await service.stopRunning('n', 'c', undefined, 'a');
      expect(rows[1].status).toBe(S.STOPPED);
      expect(rows[1].attrs?.answer_timing).toMatchObject({
        outcome: 'stopped',
        duration_ms: 3000,
      });
      await service.finalizeAnswerTiming('a', 'run', 'success', 9000);
      expect(rows[1].attrs?.answer_timing).toMatchObject({
        outcome: 'stopped',
        duration_ms: 3000,
      });
    } finally {
      clock.mockRestore();
    }
  });
  it('stops the selected turn and keeps completed outcomes, siblings and earlier turns', async () => {
    const rows = [
      row('q1', null, R.USER),
      row('old', 'q1', R.ASSISTANT, S.STREAMING),
      row('q2', null, R.USER),
      row('a2', 'q2', R.ASSISTANT),
      row(
        'ok',
        'a2',
        R.TOOL,
        S.SUCCESS,
        { tool_call: { status: 'success' } },
        'ok',
      ),
      row(
        'pending',
        'ok',
        R.TOOL,
        S.STREAMING,
        { turn_id: 'q2', turn_run_id: 'run2' },
        'pending',
      ),
      row('sibling', 'q2', R.ASSISTANT, S.STREAMING, {
        turn_id: 'q2',
        turn_run_id: 'other',
      }),
    ];
    rows[3].message.tool_calls = [
      { id: 'ok' },
      { id: 'pending' },
      { id: 'unstarted' },
    ];
    const { service } = fixture(rows);
    await service.stopRunning('n', 'c', undefined, 'pending');
    expect(rows.find((m) => m.id === 'pending')?.status).toBe(S.STOPPED);
    expect(rows.find((m) => m.id === 'pending')?.attrs?.tool_call?.status).toBe(
      'stopped',
    );
    expect(rows.find((m) => m.id === 'ok')?.attrs?.tool_call?.status).toBe(
      'success',
    );
    expect(rows.find((m) => m.id === 'a2')?.attrs?.turn_status).toBe('stopped');
    expect(rows.find((m) => m.id === 'old')?.status).toBe(S.STREAMING);
    expect(rows.find((m) => m.id === 'sibling')?.status).toBe(S.STREAMING);
    expect(rows.find((m) => m.id === 'q2')?.attrs?.stopped_runs).toEqual([
      'run2',
    ]);
    await service.stopRunning('n', 'c', undefined, 'pending');
    expect(rows.find((m) => m.id === 'q2')?.attrs?.stopped_runs).toEqual([
      'run2',
    ]);
  });
  it('persists cancellation for an unstarted declared tool without inventing a tool ID', async () => {
    const rows = [row('q', null, R.USER), row('a', 'q', R.ASSISTANT)];
    rows[1].message.tool_calls = [{ id: 'not-started' }];
    const { service } = fixture(rows);
    await service.stopRunning('n', 'c', undefined, 'a');
    expect(rows[1].attrs?.turn_status).toBe('stopped');
    expect(rows).toHaveLength(2);
  });
  it('does not mark a normally completed turn cancelled', async () => {
    const { service, rows } = fixture([
      row('q', null, R.USER),
      row('a', 'q', R.ASSISTANT),
    ]);
    await expect(service.stopRunning('n', 'c', undefined)).resolves.toBeNull();
    expect(rows[1].attrs?.turn_status).toBeUndefined();
  });
  it('keeps stopped messages stopped after late deltas, EOS and checkpoints', async () => {
    const { service, rows } = fixture([
      row('q', null, R.USER),
      row(
        't',
        'q',
        R.TOOL,
        S.STOPPED,
        { turn_id: 'q', turn_run_id: 'run', tool_call: { status: 'stopped' } },
        'call',
      ),
    ]);
    await service.updateDelta('t', {
      response_type: 'delta',
      message: { content: 'late' },
    });
    await service.update('t', 'n', 'c', { status: S.SUCCESS }, false);
    await service.saveCheckpoint('t', {
      response_type: 'checkpoint',
      checkpoint: { late: true },
    });
    expect(rows[1].status).toBe(S.STOPPED);
    expect(rows[1].message.content).toBeUndefined();
    expect(rows[1].attrs?.context).toBeUndefined();
  });
  it('cancels before BOS and prevents a later BOS from creating a row', async () => {
    const { service, rows } = fixture([row('q', null, R.USER)]);
    await service.stopRunning('n', 'c', undefined, 'q', {
      id: 'early-run',
      queryId: 'q',
    });
    await expect(
      service.create(
        'n',
        'c',
        null,
        {
          message: { role: R.TOOL },
          parentId: 'q',
          attrs: { turn_id: 'q', turn_run_id: 'early-run' },
        },
        false,
      ),
    ).rejects.toMatchObject({ code: 'STREAM_CANCELED' });
    expect(rows).toHaveLength(1);
  });
});

test('approval-resume cancellation locks and marks the decision root used by BOS', async () => {
  const question = row('q', null, R.USER);
  const assistant = row('a', 'q', R.ASSISTANT, S.INTERRUPTED);
  assistant.message.tool_calls = [{ id: 'call' }];
  const decision = row('d', 'a', R.USER, S.SUCCESS, {
    tool_call: { decisions: [{ type: 'approve' }] },
  });
  const tool = row(
    't',
    'd',
    R.TOOL,
    S.STREAMING,
    { turn_id: 'd', turn_run_id: 'resumed' },
    'call',
  );
  const { service, rows } = fixture([question, assistant, decision, tool]);
  await service.stopRunning('n', 'c', undefined, 't', {
    id: 'resumed',
    queryId: 'd',
  });
  expect(rows.find((m) => m.id === 'd')?.attrs?.stopped_runs).toEqual([
    'resumed',
  ]);
  expect(rows.find((m) => m.id === 'q')?.attrs?.stopped_runs).toBeUndefined();
  await expect(
    service.create(
      'n',
      'c',
      null,
      {
        message: { role: R.TOOL },
        parentId: 't',
        attrs: { turn_id: 'd', turn_run_id: 'resumed' },
      },
      false,
    ),
  ).rejects.toMatchObject({ code: 'STREAM_CANCELED' });
});
