import { ConfigService } from '@nestjs/config';
import { trace } from '@opentelemetry/api';

import { AttributionReporter } from './attribution-reporter.service';

describe('AttributionReporter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts activity once per user per day after a successful response', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
    } as Response);
    const reporter = new AttributionReporter({
      get: () => 'http://pro',
    } as unknown as ConfigService);

    reporter.reportActivity('user-1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    reporter.reportActivity('user-1');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://pro/internal/api/v1/attribution/user-events',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ user_id: 'user-1' }),
      }),
    );
  });

  it('retries after a failed post', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      .mockResolvedValueOnce({ ok: true } as Response);
    const reporter = new AttributionReporter({
      get: () => 'http://pro',
    } as unknown as ConfigService);

    reporter.reportActivity('user-1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    reporter.reportActivity('user-1');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('records a span event when the activity post fails', async () => {
    const addEvent = jest.fn();
    const recordException = jest.fn();
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue({
      addEvent,
      recordException,
    } as never);
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);
    const reporter = new AttributionReporter({
      get: () => 'http://pro',
    } as unknown as ConfigService);

    reporter.reportActivity('user-1');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(recordException).toHaveBeenCalled();
    expect(addEvent).toHaveBeenCalledWith(
      'attribution.activity.failed',
      expect.objectContaining({ 'user.id': 'user-1' }),
    );
  });

  it('does nothing when OBB_PRO_URL is empty', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const reporter = new AttributionReporter({
      get: () => '',
    } as unknown as ConfigService);

    reporter.reportActivity('user-1');
    await Promise.resolve();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  describe('reportKeyActionCandidate', () => {
    const candidateUrl =
      'http://pro/internal/api/v1/attribution/key-action-candidates';
    const candidateResponse = (recorded: boolean): Response =>
      ({ ok: true, json: () => Promise.resolve({ recorded }) }) as Response;
    const flushMicrotasks = async (): Promise<void> => {
      for (let i = 0; i < 5; i += 1) {
        await Promise.resolve();
      }
    };
    const createReporter = (): AttributionReporter =>
      new AttributionReporter({
        get: () => 'http://pro',
      } as unknown as ConfigService);

    it('posts a candidate once per user per day when pro records the event', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(candidateResponse(true));
      const reporter = createReporter();

      reporter.reportKeyActionCandidate('user-1');
      await flushMicrotasks();
      reporter.reportKeyActionCandidate('user-1');
      await flushMicrotasks();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        candidateUrl,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ user_id: 'user-1' }),
        }),
      );
    });

    it('keeps posting candidates while pro records no event', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(candidateResponse(false));
      const reporter = createReporter();

      reporter.reportKeyActionCandidate('user-1');
      await flushMicrotasks();
      reporter.reportKeyActionCandidate('user-1');
      await flushMicrotasks();

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('retries after a failed candidate post and stops after success', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
        .mockResolvedValueOnce(candidateResponse(true));
      const reporter = createReporter();

      reporter.reportKeyActionCandidate('user-1');
      await flushMicrotasks();
      reporter.reportKeyActionCandidate('user-1');
      await flushMicrotasks();
      reporter.reportKeyActionCandidate('user-1');
      await flushMicrotasks();

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('treats a non-JSON response as a failure and retries', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.reject(new SyntaxError('Unexpected end of JSON input')),
        } as Response)
        .mockResolvedValueOnce(candidateResponse(true));
      const reporter = createReporter();

      reporter.reportKeyActionCandidate('user-1');
      await flushMicrotasks();
      reporter.reportKeyActionCandidate('user-1');
      await flushMicrotasks();

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('posts again on the next Asia/Shanghai day', async () => {
      const firstDay = Date.parse('2026-11-04T12:00:00+08:00');
      const secondDay = Date.parse('2026-11-05T12:00:00+08:00');
      jest.useFakeTimers({ now: firstDay });
      try {
        const fetchSpy = jest
          .spyOn(global, 'fetch')
          .mockResolvedValue(candidateResponse(true));
        const reporter = createReporter();

        reporter.reportKeyActionCandidate('user-1');
        await flushMicrotasks();
        jest.setSystemTime(secondDay);
        reporter.reportKeyActionCandidate('user-1');
        await flushMicrotasks();

        expect(fetchSpy).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('records a span event when the candidate post fails', async () => {
      const addEvent = jest.fn();
      const recordException = jest.fn();
      jest.spyOn(trace, 'getActiveSpan').mockReturnValue({
        addEvent,
        recordException,
      } as never);
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);
      const reporter = createReporter();

      reporter.reportKeyActionCandidate('user-1');
      await flushMicrotasks();

      expect(recordException).toHaveBeenCalled();
      expect(addEvent).toHaveBeenCalledWith(
        'attribution.key_action_candidate.failed',
        expect.objectContaining({ 'user.id': 'user-1' }),
      );
    });

    it('does nothing without a pro URL or a user id', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');
      const reporterWithoutPro = new AttributionReporter({
        get: () => '',
      } as unknown as ConfigService);
      const reporter = createReporter();

      reporterWithoutPro.reportKeyActionCandidate('user-1');
      reporter.reportKeyActionCandidate('');
      await flushMicrotasks();

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
