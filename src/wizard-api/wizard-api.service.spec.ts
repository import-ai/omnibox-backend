import { WizardAgentRequestDto } from 'omniboxd/wizard/dto/agent-request.dto';

import { WizardAPIService } from './wizard-api.service';

describe('WizardAPIService.createAgentStream', () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;
  const getBaseUrl = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response('ok'));
    getBaseUrl.mockReset().mockResolvedValue('http://wizard-pro');
    global.fetch = fetchMock;
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  const service = () =>
    new WizardAPIService(
      { getBaseUrl } as never,
      { t: (k: string) => k } as never,
    );
  const request = (extra: Partial<WizardAgentRequestDto>) =>
    ({
      namespace_id: 'ns',
      conversation_id: 'c',
      query: 'hi',
      tools: [],
      ...extra,
    }) as unknown as WizardAgentRequestDto;
  const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body);

  it.each(['pro', 'basic'] as const)(
    'routes by a level-less %s edition but lets the wizard pick its default level',
    async (edition) => {
      const body = request({ edition });

      await service().createAgentStream('ns', 'ask', body, 'req');

      expect(getBaseUrl).toHaveBeenCalledWith(
        'ns',
        expect.objectContaining({ edition }),
      );
      expect(sentBody()).not.toHaveProperty('edition');
      expect(sentBody()).not.toHaveProperty('level');
      expect(fetchMock.mock.calls[0][0]).toBe(
        'http://wizard-pro/api/v1/wizard/ask',
      );
    },
  );

  it('forwards an explicit edition and level unchanged', async () => {
    await service().createAgentStream(
      'ns',
      'ask',
      request({ edition: 'pro', level: 'high' }),
      'req',
    );

    expect(sentBody()).toMatchObject({ edition: 'pro', level: 'high' });
  });
});
