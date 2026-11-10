import { HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';

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
      { historyLimit: jest.fn().mockResolvedValue(3) } as any,
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

  describe('same-value name and content updates', () => {
    function createService() {
      const oldResource = {
        id: 'resource-id',
        namespaceId: 'namespace-id',
        resourceType: ResourceType.DOC,
        name: 'Document',
        content: 'Body',
        version: 2,
        parentId: null,
        tagIds: [],
      };
      const repo = {
        findOne: jest.fn().mockResolvedValue(oldResource),
        findOneOrFail: jest.fn().mockResolvedValue(oldResource),
        update: jest.fn(),
      };
      const resourceRevisionService = {
        archive: jest.fn(),
        historyLimit: jest.fn().mockResolvedValue(3),
      };
      const resourceContributorsService = {
        recordEdit: jest.fn(),
      };
      const service = new ResourcesService(
        {} as any,
        repo as any,
        { emitUpsertIndexTask: jest.fn() } as any,
        {} as any,
        { t: jest.fn() } as any,
        {} as any,
        { updateStorageUsage: jest.fn() } as any,
        {} as any,
        resourceRevisionService as any,
        resourceContributorsService as any,
      );

      return {
        service,
        repo,
        resourceRevisionService,
        resourceContributorsService,
      };
    }

    const tx = { entityManager: { getRepository: jest.fn() } } as any;

    it('returns before archiving or updating when both values are unchanged', async () => {
      const {
        service,
        repo,
        resourceRevisionService,
        resourceContributorsService,
      } = createService();
      tx.entityManager.getRepository.mockReturnValue(repo);
      jest
        .spyOn(service as any, 'resolveUniqueName')
        .mockResolvedValue('Document');

      await service.updateResource(
        'namespace-id',
        'resource-id',
        'user-id',
        { name: 'Document', content: 'Body' },
        tx,
        false,
        { historyLimit: 3 },
      );

      expect(repo.update).not.toHaveBeenCalled();
      expect(resourceRevisionService.archive).not.toHaveBeenCalled();
      expect(resourceContributorsService.recordEdit).not.toHaveBeenCalled();
    });

    it('keeps tag updates on the normal persistence path', async () => {
      const { service, repo } = createService();
      tx.entityManager.getRepository.mockReturnValue(repo);

      await service.updateResource(
        'namespace-id',
        'resource-id',
        'user-id',
        { content: 'Body', tagIds: ['tag-id'] },
        tx,
        false,
        { historyLimit: 3 },
      );

      expect(repo.update).toHaveBeenCalledTimes(1);
    });

    it('skips contributor recording for system writes', async () => {
      const { service, repo, resourceContributorsService } = createService();
      tx.entityManager.getRepository.mockReturnValue(repo);

      await service.updateResource(
        'namespace-id',
        'resource-id',
        'user-id',
        { content: 'Parsed body' },
        tx,
        false,
        { historyLimit: 3, skipAttribution: true },
      );

      expect(repo.update).toHaveBeenCalledTimes(1);
      expect(resourceContributorsService.recordEdit).not.toHaveBeenCalled();
    });

    // System writes opt out of attribution, but a user write must still credit
    // the editor: the opt-out is per call, never per resource type.
    it('records the edit for user writes on the same document', async () => {
      const { service, repo, resourceContributorsService } = createService();
      tx.entityManager.getRepository.mockReturnValue(repo);

      await service.updateResource(
        'namespace-id',
        'resource-id',
        'user-id',
        { content: 'Edited body' },
        tx,
        false,
        { historyLimit: 3 },
      );

      expect(resourceContributorsService.recordEdit).toHaveBeenCalledWith(
        tx.entityManager,
        expect.objectContaining({
          resourceType: ResourceType.DOC,
          actorUserId: 'user-id',
          contentChanged: true,
        }),
      );
    });

    it('keeps forced revisions on the normal persistence path', async () => {
      const { service, repo, resourceRevisionService } = createService();
      tx.entityManager.getRepository.mockReturnValue(repo);

      await service.updateResource(
        'namespace-id',
        'resource-id',
        'user-id',
        { content: 'Body' },
        tx,
        false,
        { historyLimit: 3, forceRevision: true },
      );

      expect(resourceRevisionService.archive).toHaveBeenCalledTimes(1);
      expect(repo.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('resolveUniqueName with auto-rename', () => {
    function createService(getCount: jest.Mock) {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount,
      };
      const repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
      const t = jest.fn().mockReturnValue('Resource name already exists');
      const service = new ResourcesService(
        {} as any,
        repo as any,
        {} as any,
        {} as any,
        { t } as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
      const resolve = (name: string): Promise<string | undefined> =>
        (service as any).resolveUniqueName('namespace-id', null, name, true);
      return { resolve, t };
    }

    it('throws RESOURCE_NAME_CONFLICT 409 when every candidate name exists', async () => {
      const getCount = jest.fn().mockResolvedValue(1);
      const { resolve, t } = createService(getCount);

      const error = await resolve('doc').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppException);
      expect(error).toMatchObject({
        code: 'RESOURCE_NAME_CONFLICT',
        message: 'Resource name already exists',
      });
      expect((error as AppException).getStatus()).toBe(HttpStatus.CONFLICT);
      expect(t).toHaveBeenCalledWith('resource.errors.resourceNameConflict');
      expect(getCount).toHaveBeenCalledTimes(100);
    });

    it('propagates other errors from the name check unchanged', async () => {
      const dbError = new Error('connection terminated');
      const { resolve } = createService(jest.fn().mockRejectedValue(dbError));

      await expect(resolve('doc')).rejects.toBe(dbError);
    });
  });
});
