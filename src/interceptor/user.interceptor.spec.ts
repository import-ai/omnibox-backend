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
    ['GET', '/api/v1/wechat/callback?code=abc'],
    ['POST', '/api/v1/google/callback'],
    ['POST', '/api/v1/auth/verify-otp'],
  ])('sets user.id for successful %s %s responses', (method, url) => {
    const interceptor = new UserInterceptor();
    const context = createHttpContext({ method, url });
    const next = { handle: () => of({ id: 'user-1' }) };

    interceptor.intercept(context, next).subscribe();

    expect(setAttribute).toHaveBeenCalledWith('user.id', 'user-1');
    expect(end).toHaveBeenCalled();
  });

  it('reports attribution activity on login routes', () => {
    const reportActivity = jest.fn();
    const interceptor = new UserInterceptor({
      reportActivity,
    } as any);
    const context = createHttpContext({
      method: 'POST',
      url: '/api/v1/login',
    });
    const next = { handle: () => of({ id: 'user-1' }) };

    interceptor.intercept(context, next).subscribe();

    expect(reportActivity).toHaveBeenCalledWith('user-1');
  });

  it('reports attribution activity from res.json login payloads', () => {
    const reportActivity = jest.fn();
    const interceptor = new UserInterceptor({
      reportActivity,
    } as any);
    const json = jest.fn((body: unknown) => body);
    const response = { json };
    const context = createHttpContext(
      {
        method: 'POST',
        url: '/api/v1/auth/verify-otp',
      },
      response,
    );
    const next = {
      handle: () => {
        response.json({ id: 'user-1', access_token: 'token' });
        return of(response);
      },
    };

    interceptor.intercept(context, next).subscribe();

    expect(reportActivity).toHaveBeenCalledWith('user-1');
  });

  it('does not report attribution activity on ordinary authenticated requests', () => {
    const reportActivity = jest.fn();
    const interceptor = new UserInterceptor({
      reportActivity,
    } as any);
    const context = createHttpContext({
      method: 'GET',
      url: '/api/v1/users/me',
      user: { id: 'user-1' },
    });
    const next = { handle: () => of({ id: 'user-1' }) };

    interceptor.intercept(context, next).subscribe();

    expect(reportActivity).not.toHaveBeenCalled();
  });
});

function createHttpContext(
  request: {
    method: string;
    url: string;
    user?: { id: string };
  },
  response: { json: jest.Mock } = { json: jest.fn() },
): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ExecutionContext;
}
