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

  describe('reportKeyActionCandidate', () => {
    function createService() {
      const attributionReporter = { reportKeyActionCandidate: jest.fn() };
      const service = new ResourcesService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        attributionReporter as any,
      );
      return { service, attributionReporter };
    }

    function createTx() {
      return { entityManager: {}, afterCommitHooks: [] } as any;
    }

    it.each([ResourceType.DOC, ResourceType.LINK, ResourceType.FILE])(
      'queues a candidate for a created %s',
      async (resourceType) => {
        const { service, attributionReporter } = createService();
        const tx = createTx();

        (service as any).reportKeyActionCandidate(
          tx,
          { userId: 'user-1', resourceType, parentId: 'parent-id' },
          undefined,
        );

        expect(tx.afterCommitHooks).toHaveLength(1);
        expect(
          attributionReporter.reportKeyActionCandidate,
        ).not.toHaveBeenCalled();
        await tx.afterCommitHooks[0]();
        expect(
          attributionReporter.reportKeyActionCandidate,
        ).toHaveBeenCalledWith('user-1');
      },
    );

    it('queues a candidate for a folder under a parent', async () => {
      const { service, attributionReporter } = createService();
      const tx = createTx();

      (service as any).reportKeyActionCandidate(
        tx,
        {
          userId: 'user-1',
          resourceType: ResourceType.FOLDER,
          parentId: 'parent-id',
        },
        undefined,
      );

      await tx.afterCommitHooks[0]();
      expect(attributionReporter.reportKeyActionCandidate).toHaveBeenCalledWith(
        'user-1',
      );
    });

    it.each([
      [
        'root folder',
        {
          userId: 'user-1',
          resourceType: ResourceType.FOLDER,
          parentId: null,
        },
        undefined,
      ],
      [
        'smart folder',
        {
          userId: 'user-1',
          resourceType: ResourceType.SMART_FOLDER,
          parentId: 'parent-id',
        },
        undefined,
      ],
      [
        'rss folder',
        {
          userId: 'user-1',
          resourceType: ResourceType.RSS_FOLDER,
          parentId: 'parent-id',
        },
        undefined,
      ],
      [
        'rss item',
        {
          userId: 'user-1',
          resourceType: ResourceType.RSS_ITEM,
          parentId: 'parent-id',
        },
        undefined,
      ],
      [
        'collect placeholder',
        {
          userId: 'user-1',
          resourceType: ResourceType.LINK,
          parentId: 'parent-id',
        },
        'collect',
      ],
      [
        'welcome doc',
        {
          userId: 'user-1',
          resourceType: ResourceType.DOC,
          parentId: 'parent-id',
        },
        'welcome',
      ],
      [
        'anonymous resource',
        {
          userId: null,
          resourceType: ResourceType.DOC,
          parentId: 'parent-id',
        },
        undefined,
      ],
    ])('does not queue a candidate for a %s', (_label, resource, source) => {
      const { service, attributionReporter } = createService();
      const tx = createTx();

      (service as any).reportKeyActionCandidate(tx, resource, source);

      expect(tx.afterCommitHooks).toHaveLength(0);
      expect(
        attributionReporter.reportKeyActionCandidate,
      ).not.toHaveBeenCalled();
    });
  });
});
