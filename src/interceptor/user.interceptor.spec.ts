import { ExecutionContext } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { of } from 'rxjs';

import { UserInterceptor } from './user.interceptor';

describe('UserInterceptor', () => {
  const setAttribute = jest.fn();
  const end = jest.fn();
  const startActiveSpan = jest.fn((_name, _options, _context, callback) =>
    callback({ setAttribute, end }),
  );

  beforeEach(() => {
    jest.spyOn(trace, 'getTracer').mockReturnValue({ startActiveSpan } as any);
    setAttribute.mockClear();
    end.mockClear();
    startActiveSpan.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ['GET', '/api/v1/wechat/callback'],
    ['POST', '/api/v1/google/callback'],
  ])('sets user.id for successful %s %s responses', (method, url) => {
    const interceptor = new UserInterceptor();
    const context = createHttpContext({ method, url });
    const next = { handle: () => of({ id: 'user-1' }) };

    interceptor.intercept(context, next).subscribe();

    expect(setAttribute).toHaveBeenCalledWith('user.id', 'user-1');
    expect(end).toHaveBeenCalled();
  });
});

function createHttpContext(request: {
  method: string;
  url: string;
  user?: { id: string };
}): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}
