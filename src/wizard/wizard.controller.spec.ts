import { MessageEvent } from '@nestjs/common';
import { Share } from 'omniboxd/shares/entities/share.entity';
import { SSE_HEARTBEAT_EVENT } from 'omniboxd/wizard/sse-heartbeat';
import { StreamService } from 'omniboxd/wizard/stream.service';
import {
  SharedWizardController,
  WizardController,
} from 'omniboxd/wizard/wizard.controller';
import { Observable, Subject } from 'rxjs';

const PING = SSE_HEARTBEAT_EVENT;
const body = { query: 'hello', conversation_id: 'conv', tools: [] } as any;
const share = { id: 'share', namespaceId: 'ns' } as Share;

function createStreamService() {
  const source = new Subject<MessageEvent>();
  const stub = {
    createUserAgentStream: jest.fn().mockResolvedValue(source),
    resumeUserAgentStream: jest.fn().mockReturnValue(source),
    createShareAgentStream: jest.fn().mockResolvedValue(source),
    resumeShareAgentStream: jest.fn().mockReturnValue(source),
  };
  return { source, stub, service: stub as unknown as StreamService };
}

async function collect(
  source: Subject<MessageEvent>,
  stream: Observable<MessageEvent> | Promise<Observable<MessageEvent>>,
) {
  const events: MessageEvent[] = [];
  (await stream).subscribe((event) => events.push(event));
  source.next({ data: 'first' });
  jest.advanceTimersByTime(14_999);
  expect(events).toEqual([{ data: 'first' }]);
  jest.advanceTimersByTime(1);
  expect(events).toEqual([{ data: 'first' }, PING]);
  expect(events[1]).toStrictEqual({ type: 'ping' });
  expect(events[1].data).toBeUndefined();
  return events;
}

describe('WizardController SSE heartbeat', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each(['ask', 'write'] as const)(
    'pings %s after 15 seconds of silence',
    async (mode) => {
      const { source, stub, service } = createStreamService();
      const controller = new WizardController({} as any, service, {} as any);
      await collect(
        source,
        controller[mode]('user', 'ns', 'req', body, 'Asia/Shanghai'),
      );
      expect(stub.createUserAgentStream).toHaveBeenCalledWith(
        'user',
        'ns',
        body,
        'req',
        mode,
        'Asia/Shanghai',
      );
    },
  );

  it('pings a resumed stream after 15 seconds of silence', async () => {
    const { source, stub, service } = createStreamService();
    const controller = new WizardController({} as any, service, {} as any);
    await collect(source, controller.resume('user', 'ns', 'conv', '1-0'));
    expect(stub.resumeUserAgentStream).toHaveBeenCalledWith(
      'user',
      'ns',
      'conv',
      '1-0',
    );
  });
});

describe('SharedWizardController SSE heartbeat', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each(['ask', 'write'] as const)(
    'pings %s after 15 seconds of silence',
    async (mode) => {
      const { source, stub, service } = createStreamService();
      const controller = new SharedWizardController(service);
      await collect(
        source,
        controller[mode](share, 'req', body, 'Asia/Shanghai'),
      );
      expect(stub.createShareAgentStream).toHaveBeenCalledWith(
        share,
        body,
        'req',
        mode,
        'Asia/Shanghai',
      );
    },
  );

  it('pings a resumed stream after 15 seconds of silence', async () => {
    const { source, stub, service } = createStreamService();
    const controller = new SharedWizardController(service);
    await collect(source, controller.resume(share, 'conv', '1-0'));
    expect(stub.resumeShareAgentStream).toHaveBeenCalledWith(
      share,
      'conv',
      '1-0',
    );
  });
});
