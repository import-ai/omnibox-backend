import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';

import { UPGRADE_REQUIRED_STATUS } from './captcha.constants';
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

  it('rejects with the generic 403 when the service failed closed', async () => {
    // A credential/permission misconfiguration must not leak to the user: they
    // get the ordinary "verification failed" message, the operator gets the
    // detail in CaptchaService's error log. The code still lands in the warn.
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    captchaService.verify.mockResolvedValue({
      passed: false,
      code: 'CREDENTIAL_ERROR',
    });

    const error = await guard
      .canActivate(createContext({ captcha_verify_param: 'ok' }))
      .then(
        () => undefined,
        (thrown: unknown) => thrown,
      );

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getStatus()).toBe(403);
    expect((error as ForbiddenException).message).toBe('captcha.errors.failed');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('code=CREDENTIAL_ERROR'),
    );
    warn.mockRestore();
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

  describe('outdated mobile clients', () => {
    const expectUpgradeRequired = async (headers: Record<string, string>) => {
      const error = await guard
        .canActivate(createContext({ email: 'a@b.com' }, headers))
        .then(
          () => undefined,
          (thrown: unknown) => thrown,
        );

      expect(error).toBeInstanceOf(HttpException);
      const httpError = error as HttpException;
      expect(httpError.getStatus()).toBe(UPGRADE_REQUIRED_STATUS);
      expect(httpError.getStatus()).toBe(426);
      expect(httpError.message).toBe('captcha.errors.upgradeRequired');
      expect(captchaService.verify).not.toHaveBeenCalled();
    };

    it('asks an old ios app to update instead of demanding a captcha', async () => {
      await expectUpgradeRequired({
        'x-client-platform': 'ios',
        'x-client-version': '0.1.49',
      });
    });

    it('asks an android app with no version header to update', async () => {
      await expectUpgradeRequired({ 'x-client-platform': 'android' });
    });

    it('keeps the ordinary 400 for an app new enough to send a captcha', async () => {
      await expect(
        guard.canActivate(
          createContext(
            { email: 'a@b.com' },
            { 'x-client-platform': 'ios', 'x-client-version': '0.1.52' },
          ),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it.each([
      ['web', { 'x-client-platform': 'web' }],
      ['no platform header', {}],
    ])('keeps the ordinary 400 for %s', async (_name, headers) => {
      const error = await guard
        .canActivate(createContext({ email: 'a@b.com' }, headers))
        .then(
          () => undefined,
          (thrown: unknown) => thrown,
        );

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getStatus()).toBe(400);
      expect((error as BadRequestException).message).toBe(
        'captcha.errors.required',
      );
    });

    it('still verifies a captcha sent by an outdated client', async () => {
      captchaService.verify.mockResolvedValue({ passed: true, code: 'T' });

      await expect(
        guard.canActivate(
          createContext(
            { captcha_verify_param: 'ok' },
            { 'x-client-platform': 'ios', 'x-client-version': '0.1.49' },
          ),
        ),
      ).resolves.toBe(true);
      expect(captchaService.verify).toHaveBeenCalledWith('ok', 'app');
    });

    it('rejects a forged captcha from an outdated client with 403, not 426', async () => {
      captchaService.verify.mockResolvedValue({ passed: false, code: 'F' });

      await expect(
        guard.canActivate(
          createContext(
            { captcha_verify_param: 'forged' },
            { 'x-client-platform': 'android', 'x-client-version': '0.1.10' },
          ),
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(captchaService.verify).toHaveBeenCalledWith('forged', 'app');
    });
  });
});

describe('captcha upgradeRequired message', () => {
  // The released app's getLoginError swallows any message containing "valid",
  // and its axios interceptor logs the user out on a message containing "401".
  it.each(['en', 'zh'])('stays readable in the old %s app', (lang) => {
    const messages = JSON.parse(
      readFileSync(join(__dirname, '..', 'i18n', lang, 'captcha.json'), 'utf8'),
    ) as { errors: { upgradeRequired?: string } };
    const message = messages.errors.upgradeRequired;

    expect(typeof message).toBe('string');
    expect(message).not.toMatch(/valid/i);
    expect(message).not.toContain('401');
  });
});
