import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthService } from 'omniboxd/auth/auth.service';

import { WechatController } from './wechat.controller';
import { WechatService } from './wechat.service';

describe('WechatController', () => {
  const configService = {
    get: jest.fn((key: string, fallback: string) =>
      key === 'OBB_JWT_EXPIRE' ? '3600' : fallback,
    ),
  } as unknown as ConfigService;
  const req = {
    secure: true,
    headers: {},
  } as unknown as Request;

  function createController(checkState: jest.Mock): {
    controller: WechatController;
    cookie: jest.Mock;
  } {
    const controller = new WechatController(
      { checkState } as unknown as WechatService,
      {} as AuthService,
      configService,
    );
    const cookie = jest.fn();
    return { controller, cookie };
  }

  it('sets the session cookie when the poll reports success', async () => {
    const checkState = jest.fn().mockResolvedValue({
      status: 'success',
      user: { id: 'user-1', access_token: 'token-1' },
    });
    const { controller, cookie } = createController(checkState);

    await expect(
      controller.checkState('state-1', 'device-token', req, {
        cookie,
      } as unknown as Response),
    ).resolves.toEqual({
      status: 'success',
      user: { id: 'user-1', access_token: 'token-1' },
    });
    expect(cookie).toHaveBeenCalledWith('token', 'token-1', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      maxAge: 3600 * 1000,
    });
  });

  it('leaves the cookie untouched while the poll is pending', async () => {
    const checkState = jest.fn().mockResolvedValue({ status: 'pending' });
    const { controller, cookie } = createController(checkState);

    await controller.checkState('state-1', 'device-token', req, {
      cookie,
    } as unknown as Response);

    expect(cookie).not.toHaveBeenCalled();
  });

  it('leaves the cookie untouched when the state expired', async () => {
    const checkState = jest.fn().mockResolvedValue({ status: 'expired' });
    const { controller, cookie } = createController(checkState);

    await controller.checkState('state-1', 'device-token', req, {
      cookie,
    } as unknown as Response);

    expect(cookie).not.toHaveBeenCalled();
  });
});
