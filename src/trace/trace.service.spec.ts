import { TraceService } from 'omniboxd/trace/trace.service';

describe('TraceService', () => {
  it('emits client metadata alongside the authenticated user', async () => {
    const kafkaService = { produce: jest.fn().mockResolvedValue(undefined) };
    const configService = {
      get: jest.fn((key: string) =>
        key === 'OBB_TRACE_TOPIC' ? 'trace-topic' : undefined,
      ),
    };
    const service = new TraceService(configService as any, kafkaService as any);

    await service.emitTraceEvents(
      [{ name: 'chat_error', props: { conversation_id: 'conversation-id' } }],
      {
        userId: 'user-id',
        userAgent: 'test-agent',
        platform: 'ios',
        clientVersion: '0.1.56',
        clientBuild: '56',
      },
    );

    expect(kafkaService.produce).toHaveBeenCalledTimes(1);
    const [topic, messages] = kafkaService.produce.mock.calls[0];
    expect(topic).toBe('trace-topic');
    expect(JSON.parse(messages[0].value)).toMatchObject({
      event_name: 'chat_error',
      event_props: JSON.stringify({
        conversation_id: 'conversation-id',
        platform: 'ios',
        client_version: '0.1.56',
        client_build: '56',
      }),
      user_id: 'user-id',
      user_agent: 'test-agent',
      platform: 'ios',
      client_version: '0.1.56',
      client_build: '56',
    });
  });
});
