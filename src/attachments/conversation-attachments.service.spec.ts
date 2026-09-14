import { Readable } from 'node:stream';

import { ConversationAttachmentsService } from './conversation-attachments.service';
import { ConversationAttachment } from './entities/conversation-attachment.entity';

describe('Conversation attachment lifecycle', () => {
  function setup() {
    const attachment = {
      id: 'att',
      namespaceId: 'ns',
      conversationId: 'conv',
      userId: 'user',
      name: 'image.png',
      contentType: 'image/png',
      objectKey: 'draft/image.png',
      consumedAt: new Date(),
      expiresAt: new Date(0),
    };
    let mapping: { attachmentId: string } | null = null;
    let hasRelation = true;
    let lock = Promise.resolve();
    const mappings = {
      findOne: jest.fn(() => Promise.resolve(mapping)),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        mapping = value;
        return Promise.resolve(value);
      }),
    };
    const repository = {
      find: jest.fn().mockResolvedValue([{ id: 'att' }]),
      softDelete: jest.fn(),
      manager: {
        transaction: jest.fn(async (callback) => {
          let release: (() => void) | undefined;
          const lockedRepository = {
            findOne: jest.fn(async (options) => {
              if (options.lock?.mode === 'pessimistic_write') {
                const previous = lock;
                lock = new Promise<void>((resolve) => {
                  release = resolve;
                });
                await previous;
              }
              if (options.where.consumedAt && attachment.consumedAt)
                return null;
              return attachment;
            }),
            softDelete: jest.fn(),
          };
          const manager = {
            getRepository: (entity: unknown) =>
              entity === ConversationAttachment ? lockedRepository : mappings,
          };
          try {
            return await callback(manager);
          } finally {
            release?.();
          }
        }),
      },
    };
    const s3 = {
      getObject: jest.fn(() =>
        Promise.resolve({ stream: Readable.from(Buffer.from('pixels')) }),
      ),
      generateObjectKey: jest.fn().mockResolvedValue({
        objectKey: 'attachments/copied',
        objectName: 'copied',
      }),
      putObject: jest.fn(),
      deleteObject: jest.fn(),
    };
    const relations = {
      getResourceAttachment: jest.fn(() =>
        Promise.resolve(hasRelation ? {} : null),
      ),
      addAttachmentToResource: jest.fn(),
    };
    const permissions = { userHasPermissionOrFail: jest.fn() };
    const service = new ConversationAttachmentsService(
      s3 as any,
      { t: (key: string) => key } as any,
      permissions as any,
      relations as any,
      repository as any,
      { findOne: jest.fn().mockResolvedValue({ id: 'conv' }) } as any,
    );
    return {
      service,
      s3,
      relations,
      mappings,
      permissions,
      attachment,
      deleteRelation: () => {
        hasRelation = false;
      },
    };
  }

  it('serializes concurrent copies and accounts for storage once', async () => {
    const { service, s3, relations } = setup();
    const copy = () =>
      service.promoteConversationAttachment('ns', 'conv', 'att', 'doc', 'user');
    expect(await Promise.all([copy(), copy()])).toEqual([
      { attachment_id: 'copied' },
      { attachment_id: 'copied' },
    ]);
    expect(s3.putObject).toHaveBeenCalledTimes(1);
    expect(relations.addAttachmentToResource).toHaveBeenCalledTimes(1);
    expect(relations.addAttachmentToResource.mock.calls[0][5]).toHaveProperty(
      'entityManager',
    );
  });

  it('rejects an empty upload before writing to object storage', async () => {
    const { service, s3 } = setup();
    await expect(
      service.uploadConversationAttachment('ns', 'conv', 'user', {
        originalname: 'empty.png',
        mimetype: 'image/png',
        size: 0,
        buffer: Buffer.alloc(0),
      } as Express.Multer.File),
    ).rejects.toMatchObject({ status: 400 });
    expect(s3.generateObjectKey).not.toHaveBeenCalled();
    expect(s3.putObject).not.toHaveBeenCalled();
  });

  it('recreates a previously deleted document attachment', async () => {
    const { service, s3, deleteRelation } = setup();
    await service.promoteConversationAttachment(
      'ns',
      'conv',
      'att',
      'doc',
      'user',
    );
    deleteRelation();
    await service.promoteConversationAttachment(
      'ns',
      'conv',
      'att',
      'doc',
      'user',
    );
    expect(s3.putObject).toHaveBeenCalledTimes(2);
  });

  it('removes the copied object if relation persistence fails', async () => {
    const { service, s3, relations } = setup();
    relations.addAttachmentToResource.mockRejectedValue(
      new Error('database unavailable') as never,
    );
    await expect(
      service.promoteConversationAttachment('ns', 'conv', 'att', 'doc', 'user'),
    ).rejects.toThrow('database unavailable');
    expect(s3.deleteObject).toHaveBeenCalledWith('attachments/copied');
  });

  it('rechecks consumption after acquiring the cleanup lock', async () => {
    const { service, s3 } = setup();
    await service.cleanupExpiredConversationAttachments();
    expect(s3.deleteObject).not.toHaveBeenCalled();
  });

  it('rejects an expired draft before copying or downloading', async () => {
    const { service, s3, attachment } = setup();
    attachment.consumedAt = null as any;
    await expect(
      service.promoteConversationAttachment('ns', 'conv', 'att', 'doc', 'user'),
    ).rejects.toMatchObject({ status: 403 });
    expect(s3.getObject).not.toHaveBeenCalled();
  });
});
