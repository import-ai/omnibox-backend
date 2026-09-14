import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';

import { AttachmentsService } from './attachments.service';
import { ConversationAttachmentsService } from './conversation-attachments.service';

describe('AttachmentsService metadata', () => {
  function createService() {
    const s3Service = {
      headObject: jest.fn(),
      generateDownloadUrl: jest.fn(),
      hasDistinctPublicEndpoint: jest.fn().mockReturnValue(true),
    };
    const permissionsService = { userHasPermissionOrFail: jest.fn() };
    const resourceAttachmentsService = {
      listResourceAttachmentsWithTotal: jest.fn(),
      getResourceAttachmentOrFail: jest.fn(),
    };
    const sharedResourcesService = { getAndValidateResource: jest.fn() };
    const conversationAttachmentRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
    };
    const service = new AttachmentsService(
      s3Service as any,
      permissionsService as any,
      resourceAttachmentsService as any,
      sharedResourcesService as any,
    );
    const conversationService = new ConversationAttachmentsService(
      s3Service as any,
      { t: (key: string) => key } as any,
      permissionsService as any,
      resourceAttachmentsService as any,
      conversationAttachmentRepository as any,
      undefined as any,
    );
    return {
      conversationService,
      conversationAttachmentRepository,
      permissionsService,
      resourceAttachmentsService,
      s3Service,
      service,
      sharedResourcesService,
    };
  }

  it('lists paginated metadata after checking view permission', async () => {
    const {
      permissionsService,
      resourceAttachmentsService,
      s3Service,
      service,
    } = createService();
    resourceAttachmentsService.listResourceAttachmentsWithTotal.mockResolvedValue(
      {
        attachments: [{ attachmentId: 'attachment-id', attachmentSize: '42' }],
        total: 120,
      },
    );
    s3Service.headObject.mockResolvedValue({
      metadata: { filename: 'notes.txt' },
      contentType: 'text/plain',
    });

    const result = await service.listAttachments(
      'namespace-id',
      'resource-id',
      'user-id',
      (id) => `/attachments/${id}`,
      5,
      200,
    );

    expect(permissionsService.userHasPermissionOrFail).toHaveBeenCalledWith(
      'namespace-id',
      'resource-id',
      'user-id',
      ResourcePermission.CAN_VIEW,
    );
    expect(
      resourceAttachmentsService.listResourceAttachmentsWithTotal,
    ).toHaveBeenCalledWith('namespace-id', 'resource-id', 5, 100);
    expect(result).toEqual({
      attachments: [
        {
          id: 'attachment-id',
          name: 'notes.txt',
          content_type: 'text/plain',
          size: 42,
          download_url: '/attachments/attachment-id',
        },
      ],
      total: 120,
    });
  });

  it('validates share scope before listing attachments', async () => {
    const {
      permissionsService,
      resourceAttachmentsService,
      service,
      sharedResourcesService,
    } = createService();
    const share = { namespaceId: 'namespace-id' } as any;
    resourceAttachmentsService.listResourceAttachmentsWithTotal.mockResolvedValue(
      { attachments: [], total: 0 },
    );

    await service.listAttachmentsViaShare(
      share,
      'resource-id',
      (id) => `/shared-attachments/${id}`,
    );

    expect(sharedResourcesService.getAndValidateResource).toHaveBeenCalledWith(
      share,
      'resource-id',
    );
    expect(permissionsService.userHasPermissionOrFail).not.toHaveBeenCalled();
  });

  it('gets one attachment only after validating its resource relation', async () => {
    const {
      resourceAttachmentsService,
      s3Service,
      service,
      sharedResourcesService,
    } = createService();
    const share = { namespaceId: 'namespace-id' } as any;
    resourceAttachmentsService.getResourceAttachmentOrFail.mockResolvedValue({
      attachmentId: 'attachment-id',
      attachmentSize: '7',
    });
    s3Service.headObject.mockResolvedValue(null);

    const result = await service.getAttachmentInfoViaShare(
      share,
      'resource-id',
      'attachment-id',
      '/shared-attachments/attachment-id',
    );

    expect(sharedResourcesService.getAndValidateResource).toHaveBeenCalledWith(
      share,
      'resource-id',
    );
    expect(
      resourceAttachmentsService.getResourceAttachmentOrFail,
    ).toHaveBeenCalledWith('namespace-id', 'resource-id', 'attachment-id');
    expect(result).toEqual({
      id: 'attachment-id',
      name: 'attachment-id',
      content_type: null,
      size: 7,
      download_url: '/shared-attachments/attachment-id',
    });
  });

  it('returns a public signed llm url for a conversation image', async () => {
    const { conversationAttachmentRepository, s3Service, conversationService } =
      createService();
    conversationAttachmentRepository.findOne.mockResolvedValue({
      id: 'att-1',
      name: 'IMG_8769.PNG',
      contentType: 'image/png',
      objectKey: 'conversation-tempfiles/att-1.png',
      consumedAt: new Date(),
      expiresAt: new Date(Date.now() - 60_000),
    });
    s3Service.generateDownloadUrl.mockResolvedValue(
      'https://s3.example/signed-att-1',
    );

    await expect(
      conversationService.getConversationAttachmentLlmUrl(
        'ns',
        'conv',
        'att-1',
        'user',
      ),
    ).resolves.toEqual({
      id: 'att-1',
      name: 'IMG_8769.PNG',
      content_type: 'image/png',
      url: 'https://s3.example/signed-att-1',
    });
    expect(s3Service.generateDownloadUrl).toHaveBeenCalledWith(
      'conversation-tempfiles/att-1.png',
      true,
    );
  });

  it('omits llm url when S3 public endpoint is missing', async () => {
    const { conversationAttachmentRepository, s3Service, conversationService } =
      createService();
    s3Service.hasDistinctPublicEndpoint.mockReturnValue(false);
    conversationAttachmentRepository.findOne.mockResolvedValue({
      id: 'att-1',
      name: 'IMG_8769.PNG',
      contentType: 'image/png',
      objectKey: 'conversation-tempfiles/att-1.png',
      consumedAt: new Date(),
      expiresAt: new Date(),
    });

    await expect(
      conversationService.getConversationAttachmentLlmUrl(
        'ns',
        'conv',
        'att-1',
        'user',
      ),
    ).resolves.toEqual({
      id: 'att-1',
      name: 'IMG_8769.PNG',
      content_type: 'image/png',
      url: null,
    });
    expect(s3Service.generateDownloadUrl).not.toHaveBeenCalled();
  });

  it('returns a public signed llm url for a resource image', async () => {
    const {
      permissionsService,
      resourceAttachmentsService,
      s3Service,
      service,
    } = createService();
    resourceAttachmentsService.getResourceAttachmentOrFail.mockResolvedValue({
      attachmentId: 'attachment-id',
      attachmentSize: '12',
    });
    s3Service.headObject.mockResolvedValue({
      metadata: { filename: 'photo.png' },
      contentType: 'image/png',
      contentLength: 12,
    });
    s3Service.generateDownloadUrl.mockResolvedValue(
      'https://s3.example/signed-resource',
    );

    await expect(
      service.getResourceAttachmentLlmUrl(
        'namespace-id',
        'resource-id',
        'attachment-id',
        'user-id',
      ),
    ).resolves.toEqual({
      id: 'attachment-id',
      name: 'photo.png',
      content_type: 'image/png',
      url: 'https://s3.example/signed-resource',
    });
    expect(permissionsService.userHasPermissionOrFail).toHaveBeenCalled();
    expect(s3Service.generateDownloadUrl).toHaveBeenCalledWith(
      'attachments/attachment-id',
      true,
    );
  });
});
