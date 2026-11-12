import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { APIKey } from 'omniboxd/api-key/api-key.entity';
import { OpenResourcesService } from 'omniboxd/namespace-resources/open-resources.service';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { WizardAPIService } from 'omniboxd/wizard-api/wizard-api.service';
import * as request from 'supertest';

import pendingWire from './fixtures/pending-search-response';
import snapshotWire from './fixtures/snapshot-response';
import { OpenSearchController } from './open.search.controller';
import { OpenSearchService } from './open.search.service';

const key = {
  namespaceId: 'n',
  userId: 'u',
  attrs: { root_resource_id: 'root' },
} as APIKey;

const i18n = { t: () => 'Please retry the request' } as unknown as I18nService;

function fixture(wire: object) {
  jest
    .spyOn(global, 'fetch')
    .mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(wire), { status: 200 })),
    );
  const wizard = new WizardAPIService(
    { getBaseUrl: () => Promise.resolve('http://wizard.invalid') } as never,
    i18n,
  );
  const scope = {
    filterResourceScope: jest.fn((_namespace, _scope, _user, ids: string[]) =>
      Promise.resolve(ids),
    ),
  };
  const resources = {
    batchGetResourceMeta: jest.fn(() => Promise.resolve(new Map())),
  };
  const service = new OpenSearchService(
    wizard,
    scope as unknown as OpenResourcesService,
    resources as unknown as ResourcesService,
    i18n,
  );
  return { service, scope };
}

afterEach(() => jest.restoreAllMocks());

it('does not turn a pending Python wire response into a successful empty result', async () => {
  const { service, scope } = fixture(pendingWire);
  await expect(service.search(key, 'query')).rejects.toMatchObject({
    code: 'SEARCH_PENDING',
  });
  expect(scope.filterResourceScope).not.toHaveBeenCalled();
});

it('does not publish an unfinished short page as the last array page', async () => {
  const { service } = fixture({
    ...pendingWire,
    records: snapshotWire.records,
  });
  await expect(
    service.search(key, 'query', { limit: 2 }),
  ).rejects.toMatchObject({
    code: 'SEARCH_PENDING',
  });
});

it('preserves a genuinely exhausted empty result', async () => {
  const { service } = fixture({ records: [], total: 0, has_more: false });
  await expect(service.search(key, 'query')).resolves.toEqual([]);
});

it('allows a full page even when more results may follow', async () => {
  const { service } = fixture({
    ...pendingWire,
    records: snapshotWire.records,
  });
  const items = await service.search(key, 'query', { limit: 1 });
  expect(items.map((item) => item.resourceId)).toEqual(['resource-a']);
});

it('keeps older Wizard responses without continuation fields compatible', async () => {
  const { service } = fixture({ records: snapshotWire.records });
  const items = await service.search(key, 'query');
  expect(items.map((item) => item.resourceId)).toEqual(['resource-a']);
});

it('serializes pending as a retryable 503 through the real Open API controller', async () => {
  const { service } = fixture(pendingWire);
  const module = await Test.createTestingModule({
    controllers: [OpenSearchController],
    providers: [{ provide: OpenSearchService, useValue: service }],
  }).compile();
  const app = module.createNestApplication();
  // Authentication identity is a fixture; this test checks the wire contract.
  app.use((req, _res, next) => {
    req.apiKey = key;
    next();
  });
  await app.init();
  try {
    const response = await request(app.getHttpServer())
      .get('/open/api/v1/search')
      .query({ query: 'query' });
    expect(response.status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(response.body.code).toBe('search_pending');
  } finally {
    await app.close();
  }
});
