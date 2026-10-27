import { HttpStatus } from '@nestjs/common';

import { ConversationShareImagesService } from './conversation-share-images.service';

describe('ConversationShareImagesService', () => {
  const png = '11111111-1111-4111-8111-111111111111';
  const svg = '22222222-2222-4222-8222-222222222222';
  const shareRepo = { findOne: jest.fn() };
  const attachmentRepo = { find: jest.fn(), findOne: jest.fn() };
  const s3Service = { getObject: jest.fn(), headObject: jest.fn() };
  const permissionsService = { userHasPermission: jest.fn() };
  const resourceAttachmentsService = {
    getResourceAttachmentOrFail: jest.fn(),
  };

  function createService() {
    return new ConversationShareImagesService(
      shareRepo as never,
      attachmentRepo as never,
      s3Service as never,
      permissionsService as never,
      resourceAttachmentsService as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps consumed raster question images in their original order', async () => {
    const webp = '44444444-4444-4444-8444-444444444444';
    const missing = '33333333-3333-4333-8333-333333333333';
    attachmentRepo.find.mockResolvedValue([
      attachment(png, 'image/png', 'shot.png'),
      attachment(svg, 'image/svg+xml', 'icon.svg'),
      attachment(webp, 'image/webp; charset=binary', 'second.webp'),
    ]);

    await expect(
      createService().questionImages(
        'namespace-1',
        'conversation-1',
        'user-1',
        [
          message([
            { type: 'image', attachment_id: png },
            { type: 'image', attachment_id: svg },
            { type: 'image', attachment_id: missing },
            { type: 'image', attachment_id: 'not-a-uuid' },
            { type: 'image', attachment_id: webp },
            { type: 'image', attachment_id: png },
          ]),
        ],
      ),
    ).resolves.toEqual([
      [
        { attachmentId: png, name: 'shot.png' },
        { attachmentId: webp, name: 'second.webp' },
      ],
    ]);
  });

  it('publishes resource images the sharer can read', async () => {
    permissionsService.userHasPermission.mockImplementation(
      (_namespace: string, resourceId: string) =>
        Promise.resolve(resourceId === 'res-1'),
    );
    resourceAttachmentsService.getResourceAttachmentOrFail.mockResolvedValue({
      attachmentId: 'pic-1',
    });
    s3Service.headObject.mockResolvedValue({
      contentType: 'image/png',
      metadata: { filename: 'pic.png' },
    });

    await expect(
      createService().resourceImages('namespace-1', 'user-1', [
        '看 ![图](</api/v1/namespaces/namespace-1/resources/res-1/attachments/pic-1>) 和 ![隐藏](/api/v1/namespaces/namespace-1/resources/res-9/attachments/secret)',
      ]),
    ).resolves.toEqual([
      { resourceId: 'res-1', attachmentId: 'pic-1', name: 'pic.png' },
    ]);
    expect(permissionsService.userHasPermission).toHaveBeenCalledTimes(2);
  });

  it('streams a listed question image without private identifiers', async () => {
    const stream = { pipe: jest.fn(), destroy: jest.fn() };
    shareRepo.findOne.mockResolvedValue({
      id: 'share-1',
      namespaceId: 'namespace-1',
      sourceConversationId: 'conversation-1',
      userId: 'user-1',
      groups: [{ questionImages: [{ attachmentId: png, name: 'shot.png' }] }],
    });
    attachmentRepo.findOne.mockResolvedValue(
      attachment(png, 'image/png', 'shot.png'),
    );
    s3Service.getObject.mockResolvedValue({
      stream,
      meta: { contentType: 'image/png' },
    });
    const response = { setHeader: jest.fn() };

    await createService().streamQuestionImage(
      'share-1',
      png,
      response as never,
    );

    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'inline',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Content-Type-Options',
      'nosniff',
    );
    expect(JSON.stringify(response.setHeader.mock.calls)).not.toContain(
      'namespace-1',
    );
    expect(stream.pipe).toHaveBeenCalledWith(response);
  });

  it('refuses a resource image that was not published', async () => {
    shareRepo.findOne.mockResolvedValue({
      id: 'share-1',
      groups: [{ resourceImages: [] }],
    });

    await expect(
      createService().streamResourceImage('share-1', 'pic-1', {
        setHeader: jest.fn(),
      } as never),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    expect(s3Service.getObject).not.toHaveBeenCalled();
  });
});

function message(displayParts: unknown[]) {
  return {
    attrs: { composer: { display_parts: displayParts } },
  } as never;
}

function attachment(id: string, contentType: string, name: string) {
  return {
    id,
    contentType,
    name,
    objectKey: `conversation-tempfiles/${id}`,
  };
}
