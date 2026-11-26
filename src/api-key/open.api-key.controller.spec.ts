import { Test, TestingModule } from '@nestjs/testing';
import { APIKey as APIKeyEntity } from 'omniboxd/api-key/api-key.entity';
import { APIKeyService } from 'omniboxd/api-key/api-key.service';

import { OpenAPIKeyController } from './open.api-key.controller';

describe('OpenAPIKeyController', () => {
  let controller: OpenAPIKeyController;
  let apiKeyService: { delete: jest.Mock };

  beforeEach(async () => {
    apiKeyService = { delete: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OpenAPIKeyController],
      providers: [{ provide: APIKeyService, useValue: apiKeyService }],
    }).compile();

    controller = module.get<OpenAPIKeyController>(OpenAPIKeyController);
  });

  // The bot itself replies to the user's unbind command, so the key deletion
  // it triggers must not send a second success message through the bot.
  it('deletes the key without notifying bound applications', async () => {
    const apiKey = { id: 'test-api-key-id' } as APIKeyEntity;

    await controller.delete(apiKey);

    expect(apiKeyService.delete).toHaveBeenCalledWith('test-api-key-id', {
      notifyBoundApplications: false,
    });
  });
});
