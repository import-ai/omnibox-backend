import { PATH_METADATA } from '@nestjs/common/constants';
import { VALIDATE_SHARE_KEY } from 'omniboxd/decorators/validate-share.decorator';
import { InternalSharedResourcesController } from 'omniboxd/shared-resources/internal.shared-resources.controller';
import { SharedResourcesController } from 'omniboxd/shared-resources/shared-resources.controller';
import { Share } from 'omniboxd/shares/entities/share.entity';

import { InternalResourceCommentsController } from './internal.resource-comments.controller';
import { ResourceCommentsController } from './resource-comments.controller';

const thread = {
  id: 'outside-current-page',
  type: 'document',
  anchor: null,
  comments: [
    { id: 'comment', attachments: [{ id: 'image', url: '/workspace/image' }] },
  ],
};

describe('direct comment thread routes', () => {
  it.each([ResourceCommentsController, InternalResourceCommentsController])(
    'exposes a scoped GET route through %s',
    async (Controller) => {
      const getThread = jest.fn().mockResolvedValue(thread);
      const controller =
        Controller === ResourceCommentsController
          ? new ResourceCommentsController({} as any, { getThread } as any)
          : new InternalResourceCommentsController({ getThread } as any);
      const handler = (controller as any).getThread;
      expect(typeof handler).toBe('function');
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toContain(
        ':threadId',
      );
      const result = await handler.call(
        controller,
        'viewer',
        'namespace',
        'resource',
        'outside-current-page',
      );
      expect(getThread).toHaveBeenCalledWith(
        'namespace',
        'resource',
        'outside-current-page',
        'viewer',
      );
      expect(result).toEqual(thread);
    },
  );

  it.each([SharedResourcesController, InternalSharedResourcesController])(
    'validates resource access before direct shared lookup through %s',
    async (Controller) => {
      const getAndValidateResource = jest.fn().mockResolvedValue({});
      const getThread = jest.fn().mockResolvedValue(thread);
      const controller =
        Controller === SharedResourcesController
          ? new SharedResourcesController(
              { getAndValidateResource } as any,
              { getThread } as any,
              {} as any,
            )
          : new InternalSharedResourcesController(
              { getAndValidateResource } as any,
              { getThread } as any,
            );
      const handler = (controller as any).getCommentThread;
      expect(typeof handler).toBe('function');
      const options = Reflect.getMetadata(VALIDATE_SHARE_KEY, handler);
      expect(options).toMatchObject(
        Controller === SharedResourcesController
          ? { requireResources: true }
          : { trustedInternal: true, requireResources: true },
      );
      const share = Object.assign(new Share(), {
        id: 'share',
        namespaceId: 'namespace',
      });
      const result = await handler.call(
        controller,
        share,
        'resource',
        'outside-current-page',
      );
      expect(getAndValidateResource).toHaveBeenCalledWith(share, 'resource');
      expect(getAndValidateResource.mock.invocationCallOrder[0]).toBeLessThan(
        getThread.mock.invocationCallOrder[0],
      );
      expect(getThread).toHaveBeenCalledWith(
        'namespace',
        'resource',
        'outside-current-page',
        '',
        false,
      );
      expect(result).toMatchObject({
        type: 'document',
        anchor: null,
        comments: [
          {
            attachments: [
              {
                url: '/api/v1/shares/share/resources/resource/comment-attachments/image',
              },
            ],
          },
        ],
      });
      expect(thread.comments[0].attachments[0].url).toBe('/workspace/image');
      getThread.mockClear();
      getAndValidateResource.mockRejectedValueOnce(new Error('Share denied'));
      await expect(
        handler.call(controller, share, 'resource', 'outside-current-page'),
      ).rejects.toThrow('Share denied');
      expect(getThread).not.toHaveBeenCalled();
    },
  );
});
