import { HttpStatus } from '@nestjs/common';
import { FeaturePreviewFeature } from 'omniboxd/feature-previews/dto/feature-preview.dto';
import { TestClient } from 'test/test-client';

describe('FeaturePreviewsController (e2e)', () => {
  let client: TestClient;
  const tempClients: TestClient[] = [];

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
    for (const tempClient of tempClients) {
      await tempClient.close();
    }
  });

  it('should list supported feature previews as disabled by default', async () => {
    const response = await client
      .get(`/api/v1/namespaces/${client.namespace.id}/feature-previews`)
      .expect(HttpStatus.OK);

    expect(response.body).toEqual([
      {
        feature: FeaturePreviewFeature.EDITOR_V2,
        enabled: false,
      },
    ]);
  });

  it('should enable and disable a feature preview', async () => {
    const url = `/api/v1/namespaces/${client.namespace.id}/feature-previews`;

    const enableResponse = await client
      .put(url)
      .send({
        feature: FeaturePreviewFeature.EDITOR_V2,
        enabled: true,
      })
      .expect(HttpStatus.OK);

    expect(enableResponse.body).toEqual({
      feature: FeaturePreviewFeature.EDITOR_V2,
      enabled: true,
    });

    const enabledListResponse = await client.get(url).expect(HttpStatus.OK);
    expect(enabledListResponse.body).toEqual([
      {
        feature: FeaturePreviewFeature.EDITOR_V2,
        enabled: true,
      },
    ]);

    const disableResponse = await client
      .put(url)
      .send({
        feature: FeaturePreviewFeature.EDITOR_V2,
        enabled: false,
      })
      .expect(HttpStatus.OK);

    expect(disableResponse.body).toEqual({
      feature: FeaturePreviewFeature.EDITOR_V2,
      enabled: false,
    });

    const disabledListResponse = await client.get(url).expect(HttpStatus.OK);
    expect(disabledListResponse.body).toEqual([
      {
        feature: FeaturePreviewFeature.EDITOR_V2,
        enabled: false,
      },
    ]);
  });

  it('should reject invalid feature values', async () => {
    await client
      .put(`/api/v1/namespaces/${client.namespace.id}/feature-previews`)
      .send({
        feature: 'unknown_feature',
        enabled: true,
      })
      .expect(HttpStatus.BAD_REQUEST);
  });

  it('should reject access from a user outside the namespace', async () => {
    const otherClient = await TestClient.create();
    tempClients.push(otherClient);

    await otherClient
      .get(`/api/v1/namespaces/${client.namespace.id}/feature-previews`)
      .expect(HttpStatus.FORBIDDEN);

    await otherClient
      .put(`/api/v1/namespaces/${client.namespace.id}/feature-previews`)
      .send({
        feature: FeaturePreviewFeature.EDITOR_V2,
        enabled: true,
      })
      .expect(HttpStatus.FORBIDDEN);
  });
});
