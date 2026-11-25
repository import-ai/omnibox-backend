import { propagation } from '@opentelemetry/api';
import { Transaction } from 'omniboxd/utils/transaction-utils';

import { NamespacesService } from './namespaces.service';

it('captures trace headers before the namespace creation hook runs', async () => {
  const service: NamespacesService = Object.assign(
    Object.create(NamespacesService.prototype),
    {
      proUrl: 'http://backend-pro',
      createNamespace: jest.fn().mockResolvedValue({ id: 'space' }),
      addMember: jest.fn().mockResolvedValue(undefined),
    },
  );
  const afterCommitHooks: Array<() => Promise<void>> = [];
  const tx = { afterCommitHooks } as Transaction;
  const traceparent = '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01';
  const inject = jest
    .spyOn(propagation, 'inject')
    .mockImplementationOnce((_context, carrier: Record<string, string>) => {
      carrier.traceparent = traceparent;
    });
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(new Response(null, { status: 204 }));

  try {
    await service.createAndJoinNamespace('owner', 'Space', tx);
    expect(inject).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();

    await afterCommitHooks[0]();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend-pro/internal/api/v1/pro-namespaces/space/creation-hook',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', traceparent },
      }),
    );
    expect(inject).toHaveBeenCalledTimes(1);
  } finally {
    inject.mockRestore();
    fetchMock.mockRestore();
  }
});
