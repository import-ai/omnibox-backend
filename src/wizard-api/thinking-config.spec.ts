import { I18nService } from 'nestjs-i18n';
import { WizardAPIService } from 'omniboxd/wizard-api/wizard-api.service';
import { IWizardUrlProvider } from 'omniboxd/wizard-url-provider/wizard-url-provider.interface';

it('returns only public selections and supports older Wizard deployments', async () => {
  const provider = {
    getBaseUrl: jest.fn().mockResolvedValue('http://wizard'),
  } as IWizardUrlProvider;
  const service = new WizardAPIService(provider, {
    t: () => 'Request failed',
  } as unknown as I18nService);
  const fetchMock = jest.spyOn(global, 'fetch');
  try {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          basic: {
            model: 'private-model',
            parameters: { enable_thinking: false },
            default: { edition: 'basic', level: 'low', model: 'private-model' },
            levels: [
              {
                edition: 'basic',
                level: 'low',
                parameters: { enable_thinking: false },
              },
            ],
          },
        }),
      ),
    );
    expect(await service.getModelsConfig()).toEqual({
      basic: {
        default: { edition: 'basic', level: 'low' },
        levels: [{ edition: 'basic', level: 'low' }],
      },
    });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await service.getModelsConfig()).toEqual({});
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(service.getModelsConfig()).rejects.toThrow('Request failed');
  } finally {
    fetchMock.mockRestore();
  }
});

it('validates full catalogs and reports malformed upstream responses as 502', async () => {
  const service = new WizardAPIService(
    {
      getBaseUrl: () => Promise.resolve('http://wizard'),
    } as IWizardUrlProvider,
    { t: () => 'Request failed' } as unknown as I18nService,
  );
  const fetchMock = jest.spyOn(global, 'fetch');
  const basic = ['low', 'high'].map((level) => ({ edition: 'basic', level }));
  const pro = ['low', 'high', 'max'].map((level) => ({
    edition: 'pro',
    level,
  }));
  const catalog = {
    basic: { default: basic[0], levels: basic },
    pro: { default: pro[0], levels: pro },
    default: { default: basic[0], levels: [...basic, ...pro] },
  };
  try {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(catalog)));
    expect(await service.getModelsConfig('http://wizard-pro')).toEqual(catalog);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://wizard-pro/api/v1/wizard/models',
      expect.any(Object),
    );
    for (const invalid of [
      null,
      [],
      'invalid-json',
      { basic: { default: basic[0], levels: [basic[0], basic[0]] } },
      { basic: { default: basic[0], levels: pro } },
      {
        ...catalog,
        default: {
          default: pro[0],
          levels: [{ edition: 'pro', level: 'missing' }],
        },
      },
    ]) {
      fetchMock.mockResolvedValueOnce(
        new Response(
          typeof invalid === 'string' ? invalid : JSON.stringify(invalid),
        ),
      );
      await expect(service.getModelsConfig()).rejects.toMatchObject({
        status: 502,
      });
    }
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(service.getModelsConfig()).rejects.toMatchObject({
      status: 502,
      code: 'THINKING_CONFIG_UNAVAILABLE',
    });
  } finally {
    fetchMock.mockRestore();
  }
});
