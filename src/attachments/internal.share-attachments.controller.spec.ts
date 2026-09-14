import { Reflector } from '@nestjs/core';
import { ValidateShareInterceptor } from 'omniboxd/interceptor/validate-share.interceptor';
import { of } from 'rxjs';

import { InternalShareAttachmentsController } from './internal.share-attachments.controller';

describe('Internal share attachment validation', () => {
  it.each([
    'listAttachments',
    'getAttachmentLlmUrl',
    'getAttachmentInfo',
    'downloadAttachment',
  ] as const)('%s validates the share before injecting it', async (method) => {
    const share = { id: 'AbCdEf1234', namespaceId: 'ns' };
    const shares = {
      getAvailableShareOrFail: jest.fn().mockResolvedValue(share),
      getAndValidateShare: jest.fn(),
    };
    const request: any = { params: { shareId: share.id }, cookies: {} };
    const context: any = {
      getHandler: () => InternalShareAttachmentsController.prototype[method],
      switchToHttp: () => ({ getRequest: () => request }),
    };
    const interceptor = new ValidateShareInterceptor(
      new Reflector(),
      shares as any,
      {} as any,
    );
    const next = { handle: jest.fn(() => of(null)) };
    await interceptor.intercept(context, next);
    expect(shares.getAvailableShareOrFail).toHaveBeenCalledWith(share.id);
    expect(shares.getAndValidateShare).not.toHaveBeenCalled();
    expect(request.validatedShare).toBe(share);
    expect(next.handle).toHaveBeenCalledTimes(1);
    shares.getAvailableShareOrFail.mockRejectedValue(
      new Error('Share disabled'),
    );
    await expect(interceptor.intercept(context, next)).rejects.toThrow(
      'Share disabled',
    );
    expect(next.handle).toHaveBeenCalledTimes(1);
  });
});
