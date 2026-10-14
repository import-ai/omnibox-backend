import { Request, Response } from 'express';
import { getClientContext } from 'omniboxd/common/client-context';

import { ClientContextMiddleware } from './client-context.middleware';

describe('ClientContextMiddleware', () => {
  const run = (headers: Record<string, string | string[]>) => {
    let seen: string | null | undefined;
    new ClientContextMiddleware().use(
      { headers } as unknown as Request,
      {} as Response,
      () => {
        seen = getClientContext().installationId;
      },
    );
    return seen;
  };

  it('exposes the installation id header to downstream handlers', () => {
    expect(run({ 'x-installation-id': 'ins_1' })).toBe('ins_1');
  });

  it('treats a missing or malformed header as absent', () => {
    expect(run({})).toBeNull();
    expect(run({ 'x-installation-id': 'bad id' })).toBeNull();
  });
});
