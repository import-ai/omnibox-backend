import { ResourceType } from './entities/resource.entity';
import { ResourcesService } from './resources.service';

describe('ResourcesService', () => {
  it('rejects folder content updates before persisting them', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue({
        resourceType: ResourceType.FOLDER,
      }),
      update: jest.fn(),
    };
    const service = new ResourcesService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { t: jest.fn().mockReturnValue('Content is not allowed') } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.updateResource(
        'namespace-id',
        'resource-id',
        'user-id',
        { content: 'Folder content should not be accepted' },
        { entityManager: { getRepository: () => repo } } as any,
      ),
    ).rejects.toMatchObject({ code: 'CONTENT_NOT_ALLOWED_FOR_FOLDER' });
    expect(repo.update).not.toHaveBeenCalled();
  });
});
