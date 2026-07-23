import { HttpStatus } from '@nestjs/common';
import { FeaturePreviewFeature } from 'omniboxd/feature-previews/dto/feature-preview.dto';
import { FeaturePreview } from 'omniboxd/feature-previews/entities/feature-preview.entity';
import { TestClient } from 'test/test-client';
import { DataSource } from 'typeorm';

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
      .get('/api/v1/feature-previews')
      .expect(HttpStatus.OK);

    expect(response.body).toEqual({
      features: {
        [FeaturePreviewFeature.EDITOR_V2]: false,
      },
    });
  });

  it('should enable and disable a feature preview', async () => {
    const url = '/api/v1/feature-previews';

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
    expect(enabledListResponse.body).toEqual({
      features: {
        [FeaturePreviewFeature.EDITOR_V2]: true,
      },
    });

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
    expect(disabledListResponse.body).toEqual({
      features: {
        [FeaturePreviewFeature.EDITOR_V2]: false,
      },
    });
  });

  it('should reject invalid feature values', async () => {
    await client
      .put('/api/v1/feature-previews')
      .send({
        feature: 'unknown_feature',
        enabled: true,
      })
      .expect(HttpStatus.BAD_REQUEST);
  });

  it('should store feature previews independently for each user', async () => {
    const otherClient = await TestClient.create();
    tempClients.push(otherClient);

    await client
      .put('/api/v1/feature-previews')
      .send({
        feature: FeaturePreviewFeature.EDITOR_V2,
        enabled: true,
      })
      .expect(HttpStatus.OK);

    const otherUserResponse = await otherClient
      .get('/api/v1/feature-previews')
      .expect(HttpStatus.OK);
    expect(otherUserResponse.body).toEqual({
      features: {
        [FeaturePreviewFeature.EDITOR_V2]: false,
      },
    });

    const currentUserResponse = await client
      .get('/api/v1/feature-previews')
      .expect(HttpStatus.OK);
    expect(currentUserResponse.body).toEqual({
      features: {
        [FeaturePreviewFeature.EDITOR_V2]: true,
      },
    });
  });

  it('should prefer user settings without updating rollout', async () => {
    const rolloutClient = await TestClient.create();
    tempClients.push(rolloutClient);
    const repository = rolloutClient.app
      .get(DataSource)
      .getRepository(FeaturePreview);

    await repository.save({
      userId: rolloutClient.user.id,
      feature: FeaturePreviewFeature.EDITOR_V2,
      userEnabled: null,
      rolloutEnabled: true,
    });

    const url = '/api/v1/feature-previews';
    const rolloutResponse = await rolloutClient.get(url).expect(HttpStatus.OK);
    expect(rolloutResponse.body.features).toEqual({
      [FeaturePreviewFeature.EDITOR_V2]: true,
    });

    const updateResponse = await rolloutClient
      .put(url)
      .send({ feature: FeaturePreviewFeature.EDITOR_V2, enabled: false })
      .expect(HttpStatus.OK);
    expect(updateResponse.body).toEqual({
      feature: FeaturePreviewFeature.EDITOR_V2,
      enabled: false,
    });

    const preview = await repository.findOneByOrFail({
      userId: rolloutClient.user.id,
      feature: FeaturePreviewFeature.EDITOR_V2,
    });
    expect(preview.userEnabled).toBe(false);
    expect(preview.rolloutEnabled).toBe(true);
  });
});
