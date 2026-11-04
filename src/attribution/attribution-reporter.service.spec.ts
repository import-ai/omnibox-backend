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

    it('posts a candidate once per user per day after a successful response', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
      } as Response);
      const reporter = new AttributionReporter({
        get: () => 'http://pro',
      } as unknown as ConfigService);

      reporter.reportKeyActionCandidate('user-1');
      await Promise.resolve();
      reporter.reportKeyActionCandidate('user-1');
      await Promise.resolve();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        candidateUrl,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ user_id: 'user-1' }),
        }),
      );
    });

    it('retries after a failed candidate post and stops after success', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
        .mockResolvedValueOnce({ ok: true } as Response);
      const reporter = new AttributionReporter({
        get: () => 'http://pro',
      } as unknown as ConfigService);

      reporter.reportKeyActionCandidate('user-1');
      await Promise.resolve();
      reporter.reportKeyActionCandidate('user-1');
      await Promise.resolve();
      reporter.reportKeyActionCandidate('user-1');
      await Promise.resolve();

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('posts again on the next Asia/Shanghai day', async () => {
      const firstDay = Date.parse('2026-11-04T12:00:00+08:00');
      const secondDay = Date.parse('2026-11-05T12:00:00+08:00');
      jest.useFakeTimers({ now: firstDay });
      try {
        const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
          ok: true,
        } as Response);
        const reporter = new AttributionReporter({
          get: () => 'http://pro',
        } as unknown as ConfigService);

        reporter.reportKeyActionCandidate('user-1');
        await Promise.resolve();
        jest.setSystemTime(secondDay);
        reporter.reportKeyActionCandidate('user-1');
        await Promise.resolve();

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
      const reporter = new AttributionReporter({
        get: () => 'http://pro',
      } as unknown as ConfigService);

      reporter.reportKeyActionCandidate('user-1');
      await Promise.resolve();

      expect(recordException).toHaveBeenCalled();
      expect(addEvent).toHaveBeenCalledWith(
        'attribution.key_action_candidate.failed',
        expect.objectContaining({ 'user.id': 'user-1' }),
      );
    });

    it('does nothing when OBB_PRO_URL is empty', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');
      const reporter = new AttributionReporter({
        get: () => '',
      } as unknown as ConfigService);

      reporter.reportKeyActionCandidate('user-1');
      await Promise.resolve();

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
