import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

import { getSessionCookieMaxAge, setSessionCookie } from './session-cookie';

describe('session cookie options', () => {
  function createRequest(
    headers: Record<string, string>,
    secure = false,
  ): Request {
    return { secure, headers } as unknown as Request;
  }

  function createResponse(): { res: Response; cookie: jest.Mock } {
    const cookie = jest.fn();
    return { res: { cookie } as unknown as Response, cookie };
  }

  it('uses Secure and SameSite=None for HTTPS requests', () => {
    const { res, cookie } = createResponse();

    setSessionCookie(
      createRequest({ 'x-forwarded-proto': 'https' }),
      res,
      'token-1',
      1000,
    );

    expect(cookie).toHaveBeenCalledWith('token', 'token-1', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      maxAge: 1000,
    });
  });

  it('drops Secure and uses SameSite=Lax for plain HTTP', () => {
    const { res, cookie } = createResponse();

    setSessionCookie(
      createRequest({ 'x-forwarded-proto': 'http' }),
      res,
      'token-1',
      1000,
    );

    expect(cookie).toHaveBeenCalledWith('token', 'token-1', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 1000,
    });
  });

  it('treats a direct TLS request as secure', () => {
    const { res, cookie } = createResponse();

    setSessionCookie(createRequest({}, true), res, 'token-1', 1000);

    expect(cookie).toHaveBeenCalledWith(
      'token',
      'token-1',
      expect.objectContaining({ secure: true, sameSite: 'none' }),
    );
  });

  it('takes the lifetime from OBB_JWT_EXPIRE', () => {
    const configService = {
      get: jest.fn().mockReturnValue('120'),
    } as unknown as ConfigService;

    expect(getSessionCookieMaxAge(configService)).toBe(120000);
  });
});
