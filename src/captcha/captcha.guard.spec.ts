import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';

import { CaptchaGuard } from './captcha.guard';
import { CaptchaService } from './captcha.service';

describe('CaptchaGuard', () => {
  let guard: CaptchaGuard;
  let reflector: jest.Mocked<Reflector>;
  let captchaService: { enabled: boolean; verify: jest.Mock };

  const createContext = (
    body: Record<string, unknown> | undefined,
    headers: Record<string, string> = {},
  ): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ body, headers }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    captchaService = { enabled: true, verify: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaptchaGuard,
        {
          provide: Reflector,
          useValue: { getAllAndOverride: jest.fn().mockReturnValue(true) },
        },
        { provide: CaptchaService, useValue: captchaService },
        {
          provide: I18nService,
          useValue: { t: jest.fn((key: string) => key) },
        },
      ],
    }).compile();

    guard = module.get(CaptchaGuard);
    reflector = module.get(Reflector);
  });

  it('allows the request when captcha is disabled', async () => {
    captchaService.enabled = false;

    await expect(guard.canActivate(createContext({}))).resolves.toBe(true);
    expect(captchaService.verify).not.toHaveBeenCalled();
  });

  it('allows the request when the handler does not require captcha', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);

    await expect(guard.canActivate(createContext({}))).resolves.toBe(true);
    expect(captchaService.verify).not.toHaveBeenCalled();
  });

  it('rejects with 400 when captcha_verify_param is missing', async () => {
    await expect(
      guard.canActivate(createContext({ email: 'a@b.com' })),
    ).rejects.toThrow(BadRequestException);
    await expect(
      guard.canActivate(createContext({ captcha_verify_param: '' })),
    ).rejects.toThrow(BadRequestException);
    await expect(guard.canActivate(createContext(undefined))).rejects.toThrow(
      BadRequestException,
    );
    expect(captchaService.verify).not.toHaveBeenCalled();
  });

  it('rejects with 403 when verification fails', async () => {
    captchaService.verify.mockResolvedValue({ passed: false, code: 'F' });

    await expect(
      guard.canActivate(createContext({ captcha_verify_param: 'forged' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows the request when verification passes', async () => {
    captchaService.verify.mockResolvedValue({ passed: true, code: 'T' });

    await expect(
      guard.canActivate(createContext({ captcha_verify_param: 'ok' })),
    ).resolves.toBe(true);
  });

  it('picks the web scene from the x-client-platform header', async () => {
    captchaService.verify.mockResolvedValue({ passed: true });

    await guard.canActivate(
      createContext(
        { captcha_verify_param: 'ok' },
        { 'x-client-platform': 'web' },
      ),
    );

    expect(captchaService.verify).toHaveBeenCalledWith('ok', 'web');
  });

  it.each(['ios', 'android', undefined])(
    'picks the app scene for platform %s',
    async (platform) => {
      captchaService.verify.mockResolvedValue({ passed: true });
      const headers: Record<string, string> = platform
        ? { 'x-client-platform': platform }
        : {};

      await guard.canActivate(
        createContext({ captcha_verify_param: 'ok' }, headers),
      );

      expect(captchaService.verify).toHaveBeenCalledWith('ok', 'app');
    },
  );
});
