import { ConfigService } from '@nestjs/config';
import { GoogleService } from 'omniboxd/auth/google/google.service';
import { fetchWithRetry } from 'omniboxd/utils/fetch-with-retry';

jest.mock('omniboxd/utils/fetch-with-retry', () => ({
  fetchWithRetry: jest.fn(),
}));

describe('GoogleService', () => {
  it('returns a non-JSON tokeninfo response in debug mode', async () => {
    const config = {
      OBB_GOOGLE_IOS_CLIENT_ID: 'ios-client',
      OBB_GOOGLE_ANDROID_CLIENT_ID: 'android-client',
      OBB_GOOGLE_MOBILE_TOKEN_DEBUG: 'true',
    };
    const configService = {
      get: jest.fn((key: keyof typeof config, defaultValue: string) =>
        key in config ? config[key] : defaultValue,
      ),
    } as unknown as ConfigService;
    const service = new GoogleService(
      configService,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
    );
    jest
      .mocked(fetchWithRetry)
      .mockResolvedValue(new Response('Not found', { status: 404 }));

    await expect(service.handleMobileCallback('id-token')).resolves.toEqual({
      google_tokeninfo_status: 404,
      google_tokeninfo_ok: false,
      google_tokeninfo_body: 'Not found',
      allowed_audiences: ['ios-client', 'android-client'],
    });
  });
});
