import { ConfigService } from '@nestjs/config';
import { GoogleService } from 'omniboxd/auth/google/google.service';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { fetchWithRetry } from 'omniboxd/utils/fetch-with-retry';

jest.mock('omniboxd/utils/fetch-with-retry', () => ({
  fetchWithRetry: jest.fn(),
}));

describe('GoogleService', () => {
  it('uses the tokeninfo-specific base URL for mobile login', async () => {
    const config = {
      OBB_GOOGLE_IOS_CLIENT_ID: 'ios-client',
      OBB_GOOGLE_ANDROID_CLIENT_ID: 'android-client',
      OBB_GOOGLE_OAUTH_API_BASE_URL: 'http://api-proxy-server:3000',
      OBB_GOOGLE_TOKENINFO_API_BASE_URL: 'https://oauth2.googleapis.com',
    };
    const configService = {
      get: jest.fn((key: string, defaultValue: string) =>
        config[key as keyof typeof config] !== undefined
          ? config[key as keyof typeof config]
          : defaultValue,
      ),
    } as unknown as ConfigService;
    const jwtService = {
      sign: jest.fn().mockReturnValue('access-token'),
    };
    const userService = {
      findByLoginId: jest.fn().mockResolvedValue({
        id: 'user-id',
        username: 'username',
      }),
    };
    const i18n = { t: jest.fn() };
    const service = new GoogleService(
      configService,
      jwtService as never,
      userService as never,
      null as never,
      null as never,
      i18n as never,
      null as never,
    );
    jest.mocked(fetchWithRetry).mockResolvedValue(
      Response.json({
        sub: 'google-sub',
        email: 'user@example.com',
        email_verified: 'true',
        aud: 'ios-client',
      }),
    );

    await expect(service.handleMobileCallback('id-token')).resolves.toEqual({
      id: 'user-id',
      access_token: 'access-token',
    });
    expect(fetchWithRetry).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/tokeninfo',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }),
    );
    const [, options] = jest.mocked(fetchWithRetry).mock.calls[0];
    expect(options?.body).toBeInstanceOf(URLSearchParams);
    expect((options?.body as URLSearchParams).get('id_token')).toBe('id-token');
  });

  it('rejects mobile callback when no client IDs are configured (fail closed)', async () => {
    const configService = {
      get: jest.fn().mockReturnValue(''),
    } as unknown as ConfigService;
    const userService = {
      findByLoginId: jest.fn().mockResolvedValue({
        id: 'user-id',
        username: 'username',
      }),
    };
    const i18n = { t: jest.fn() };
    const service = new GoogleService(
      configService,
      {} as any,
      userService as never,
      null as any,
      null as any,
      i18n as never,
      null as any,
    );
    jest
      .mocked(fetchWithRetry)
      .mockResolvedValue(
        Response.json({ sub: 'sub', email: 'email', aud: 'other-client' }),
      );

    await expect(service.handleMobileCallback('id-token')).rejects.toThrow(
      AppException,
    );
  });

  it('rejects mobile callback when audience does not match allowed clients (mismatch)', async () => {
    const config = {
      OBB_GOOGLE_IOS_CLIENT_ID: 'ios-client',
      OBB_GOOGLE_ANDROID_CLIENT_ID: 'android-client',
    };
    const configService = {
      get: jest.fn((key) => config[key as keyof typeof config] || ''),
    } as unknown as ConfigService;
    const userService = {
      findByLoginId: jest.fn().mockResolvedValue({
        id: 'user-id',
        username: 'username',
      }),
    };
    const i18n = { t: jest.fn() };
    const service = new GoogleService(
      configService,
      {} as any,
      userService as never,
      null as any,
      null as any,
      i18n as never,
      null as any,
    );
    jest
      .mocked(fetchWithRetry)
      .mockResolvedValue(
        Response.json({ sub: 'sub', email: 'email', aud: 'other-client' }),
      );

    await expect(service.handleMobileCallback('id-token')).rejects.toThrow(
      AppException,
    );
  });

  it('rejects mobile callback when email is not verified (unverified email)', async () => {
    const config = {
      OBB_GOOGLE_IOS_CLIENT_ID: 'ios-client',
      OBB_GOOGLE_ANDROID_CLIENT_ID: 'android-client',
    };
    const configService = {
      get: jest.fn((key) => config[key as keyof typeof config] || ''),
    } as unknown as ConfigService;
    const userService = {
      findByLoginId: jest.fn().mockResolvedValue({
        id: 'user-id',
        username: 'username',
      }),
    };
    const i18n = { t: jest.fn() };
    const service = new GoogleService(
      configService,
      {} as any,
      userService as never,
      null as any,
      null as any,
      i18n as never,
      null as any,
    );
    jest.mocked(fetchWithRetry).mockResolvedValue(
      Response.json({
        sub: 'sub',
        email: 'email',
        aud: 'ios-client',
        email_verified: false,
      }),
    );

    await expect(service.handleMobileCallback('id-token')).rejects.toThrow(
      AppException,
    );
  });
});
