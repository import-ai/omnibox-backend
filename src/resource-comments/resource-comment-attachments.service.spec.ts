import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { S3Service } from 'omniboxd/s3/s3.service';
import { StorageType } from 'omniboxd/storage-usages/entities/storage-usage.entity';
import { StorageUsagesService } from 'omniboxd/storage-usages/storage-usages.service';
import { Readable } from 'stream';
import { commentPng } from 'test/comment-image-fixture';
import { DataSource, EntityManager } from 'typeorm';

import { ResourceCommentAttachment } from './entities/resource-comment-attachment.entity';
import { ResourceCommentAttachmentsService } from './resource-comment-attachments.service';

describe('comment attachment persistence', () => {
  const manager = new EntityManager(new DataSource({ type: 'postgres' }));
  const repository = manager.getRepository(ResourceCommentAttachment);
  const putObject = jest.fn();
  const updateStorageUsage = jest.fn();
  let service: ResourceCommentAttachmentsService;
  let save: jest.SpyInstance;
  let update: jest.SpyInstance;

  const file = (
    bytes = commentPng,
    mimetype = 'image/png',
  ): Express.Multer.File => ({
    fieldname: 'file',
    originalname: 'test.png',
    encoding: '7bit',
    mimetype,
    buffer: bytes,
    size: 1,
    stream: Readable.from(bytes),
    destination: '',
    filename: '',
    path: '',
  });

  beforeEach(async () => {
    jest.spyOn(manager, 'transaction').mockImplementation((run: unknown) => {
      if (typeof run !== 'function') {
        throw new Error('Unexpected transaction isolation override');
      }
      return run(manager);
    });
    jest.spyOn(manager, 'query').mockResolvedValue([]);
    jest
      .spyOn(repository, 'findOneOrFail')
      .mockResolvedValue(
        Object.assign(new ResourceCommentAttachment(), { id: 'attachment' }),
      );
    jest.spyOn(repository, 'create').mockImplementation(() =>
      Object.assign(new ResourceCommentAttachment(), {
        id: 'attachment',
        namespaceId: 'namespace',
        resourceId: 'resource',
        storageUserId: 'user',
        objectKey: 'object-key',
        name: 'test.png',
        mimetype: 'image/png',
        size: commentPng.length,
        uploadedAt: null,
      }),
    );
    save = jest
      .spyOn(repository, 'save')
      .mockImplementation((item) =>
        Promise.resolve(Object.assign(new ResourceCommentAttachment(), item)),
      );
    update = jest
      .spyOn(repository, 'update')
      .mockResolvedValue({ raw: [], affected: 1, generatedMaps: [] });
    const module = await Test.createTestingModule({
      providers: [
        ResourceCommentAttachmentsService,
        {
          provide: getRepositoryToken(ResourceCommentAttachment),
          useValue: repository,
        },
        {
          provide: PermissionsService,
          useValue: { userHasPermissionOrFail: jest.fn() },
        },
        {
          provide: S3Service,
          useValue: {
            generateObjectKey: () =>
              Promise.resolve({ objectKey: 'object-key' }),
            putObject,
          },
        },
        { provide: StorageUsagesService, useValue: { updateStorageUsage } },
        { provide: I18nService, useValue: { t: (key: string) => key } },
      ],
    }).compile();
    service = module.get(ResourceCommentAttachmentsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('charges actual bytes before S3 and marks completion only after upload', async () => {
    const result = await service.uploadAttachment(
      'namespace',
      'resource',
      'user',
      file(),
    );
    expect(result.size).toBe(commentPng.length);
    expect(updateStorageUsage).toHaveBeenCalledWith(
      'namespace',
      'user',
      StorageType.ATTACHMENT,
      commentPng.length,
      expect.anything(),
    );
    expect(updateStorageUsage.mock.invocationCallOrder[0]).toBeLessThan(
      putObject.mock.invocationCallOrder[0],
    );
    expect(putObject).toHaveBeenCalledWith(
      'object-key',
      commentPng,
      'image/png',
      expect.anything(),
    );
    expect(update).toHaveBeenCalledWith('attachment', {
      uploadedAt: expect.any(Date),
    });
  });

  it('rejects forged MIME and unsupported content before storage writes', async () => {
    await expect(
      service.uploadAttachment(
        'namespace',
        'resource',
        'user',
        file(Buffer.from('<svg/>')),
      ),
    ).rejects.toThrow();
    await expect(
      service.uploadAttachment(
        'namespace',
        'resource',
        'user',
        file(commentPng, 'image/jpeg'),
      ),
    ).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
    expect(putObject).not.toHaveBeenCalled();
  });

  it('does not write an object if the database reservation fails', async () => {
    save.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(
      service.uploadAttachment('namespace', 'resource', 'user', file()),
    ).rejects.toThrow('Database unavailable');
    expect(putObject).not.toHaveBeenCalled();
  });

  it('keeps interrupted uploads unbindable with their charged cleanup record', async () => {
    putObject.mockRejectedValueOnce(new Error('S3 unavailable'));
    await expect(
      service.uploadAttachment('namespace', 'resource', 'user', file()),
    ).rejects.toThrow('S3 unavailable');
    expect(save).toHaveBeenCalled();
    expect(updateStorageUsage).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('only binds completed uploads while locking rows in a stable order', async () => {
    const find = jest.spyOn(repository, 'find').mockResolvedValue([]);
    await expect(
      service.bindAttachments(
        manager,
        'namespace',
        'resource',
        'user',
        'comment',
        ['attachment'],
      ),
    ).rejects.toThrow();
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          uploadedAt: expect.anything(),
          commentId: expect.anything(),
        }),
        lock: { mode: 'pessimistic_write' },
        order: { id: 'ASC' },
      }),
    );
  });
});
