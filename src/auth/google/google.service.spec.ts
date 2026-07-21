import { ConfigService } from '@nestjs/config';
import { GoogleService } from 'omniboxd/auth/google/google.service';
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
      get: jest.fn((key: keyof typeof config, defaultValue: string) =>
        key in config ? config[key] : defaultValue,
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
    const service = new GoogleService(
      configService,
      jwtService as never,
      userService as never,
      null as never,
      null as never,
      null as never,
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
});
