import { HttpStatus } from '@nestjs/common';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';

import { AttachmentsService } from './attachments.service';

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
      conversationAttachmentRepository as any,
      undefined as any,
      undefined as any,
    );
    return {
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

  it('replaces conversation image preview paths with signed download urls', async () => {
    const { conversationAttachmentRepository, s3Service, service } =
      createService();
    conversationAttachmentRepository.find.mockResolvedValue([
      {
        id: 'att-1',
        objectKey: 'conversation-tempfiles/att-1.png',
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
    s3Service.generateDownloadUrl.mockResolvedValue(
      'https://s3.example/signed-att-1',
    );

    await expect(
      service.signConversationImageUrls('ns', 'conv', 'user', [
        {
          attachment_id: 'att-1',
          url: '/api/v1/namespaces/ns/conversations/conv/attachments/att-1',
          name: 'IMG_8769.PNG',
        },
      ]),
    ).resolves.toEqual([
      {
        attachment_id: 'att-1',
        url: 'https://s3.example/signed-att-1',
        name: 'IMG_8769.PNG',
      },
    ]);
    expect(s3Service.generateDownloadUrl).toHaveBeenCalledWith(
      'conversation-tempfiles/att-1.png',
      true,
    );
  });

  it('rejects conversation images when S3 public endpoint is missing', async () => {
    const { conversationAttachmentRepository, s3Service, service } =
      createService();
    s3Service.hasDistinctPublicEndpoint.mockReturnValue(false);
    conversationAttachmentRepository.find.mockResolvedValue([
      {
        id: 'att-1',
        objectKey: 'conversation-tempfiles/att-1.png',
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);

    await expect(
      service.signConversationImageUrls('ns', 'conv', 'user', [
        {
          attachment_id: 'att-1',
          url: '/preview',
          name: 'IMG_8769.PNG',
        },
      ]),
    ).rejects.toMatchObject({
      code: 'S3_PUBLIC_ENDPOINT_NOT_CONFIGURED',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    });
    expect(s3Service.generateDownloadUrl).not.toHaveBeenCalled();
  });

  it('rejects missing or expired unconsumed conversation images', async () => {
    const { conversationAttachmentRepository, service } = createService();
    conversationAttachmentRepository.find.mockResolvedValue([]);

    await expect(
      service.signConversationImageUrls('ns', 'conv', 'user', [
        {
          attachment_id: 'missing',
          url: '/preview',
          name: 'gone.png',
        },
      ]),
    ).rejects.toMatchObject({
      code: 'CONVERSATION_ATTACHMENT_ACCESS_DENIED',
      status: HttpStatus.FORBIDDEN,
    });
  });

  it('returns a public signed llm url for a conversation image', async () => {
    const { conversationAttachmentRepository, s3Service, service } =
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
      service.getConversationAttachmentLlmUrl('ns', 'conv', 'att-1', 'user'),
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
    const { conversationAttachmentRepository, s3Service, service } =
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
      service.getConversationAttachmentLlmUrl('ns', 'conv', 'att-1', 'user'),
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
