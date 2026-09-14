import { ConfigService } from '@nestjs/config';

import { AttributionReporter } from './attribution-reporter.service';

describe('AttributionReporter', () => {
  it('posts activity once per user per day', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
    } as Response);
    const reporter = new AttributionReporter({
      get: () => 'http://pro',
    } as unknown as ConfigService);

    reporter.reportActivity('user-1');
    reporter.reportActivity('user-1');
    await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://pro/internal/api/v1/attribution/user-events',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ userId: 'user-1' }),
      }),
    );
    fetchSpy.mockRestore();
  });

  it('does nothing when OBB_PRO_URL is empty', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const reporter = new AttributionReporter({
      get: () => '',
    } as unknown as ConfigService);

    reporter.reportActivity('user-1');
    await Promise.resolve();

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
