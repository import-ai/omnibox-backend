/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ReaderProcessor } from './reader.processor';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { AttachmentsService } from 'omniboxd/attachments/attachments.service';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { Resource } from 'omniboxd/resources/resources.entity';

describe('ReaderProcessor', () => {
  let processor: ReaderProcessor;
  let resourcesService: jest.Mocked<ResourcesService>;
  let attachmentsService: jest.Mocked<AttachmentsService>;

  const mockResource: Partial<Resource> = {
    id: 'test-resource-id',
    namespaceId: 'test-namespace',
    userId: 'test-user',
    name: 'Test Resource',
    attrs: { filename: 'test.pdf' },
  };

  beforeEach(async () => {
    const mockResourcesService = {
      get: jest.fn(),
      update: jest.fn(),
    };

    const mockAttachmentsService = {
      uploadAttachment: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ResourcesService,
          useValue: mockResourcesService,
        },
        {
          provide: AttachmentsService,
          useValue: mockAttachmentsService,
        },
      ],
    }).compile();

    resourcesService = module.get(ResourcesService);
    attachmentsService = module.get(AttachmentsService);
    processor = new ReaderProcessor(resourcesService, attachmentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('process', () => {
    const createMockTask = (overrides: Partial<Task> = {}): Task => ({
      id: 'test-task-id',
      namespaceId: 'test-namespace',
      userId: 'test-user',
      function: 'file_reader',
      input: { filename: 'test.pdf' },
      payload: { resource_id: 'test-resource-id' },
      output: null,
      exception: null,
      priority: 5,
      startedAt: new Date(),
      endedAt: null,
      canceledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides,
    });

    describe('markdown processing', () => {
      it('should return empty object when output has no markdown', async () => {
        const task = createMockTask({
          output: { title: 'Test Document' },
        });

        const result = await processor.process(task);

        expect(result).toEqual({});
        expect(attachmentsService.uploadAttachment).not.toHaveBeenCalled();
        expect(resourcesService.get).not.toHaveBeenCalled();
      });

      it('should return empty object when output is null', async () => {
        const task = createMockTask({
          output: null,
        });

        const result = await processor.process(task);

        expect(result).toEqual({});
        expect(attachmentsService.uploadAttachment).not.toHaveBeenCalled();
      });

      it('should process markdown without images and call parent process', async () => {
        const task = createMockTask({
          payload: { resource_id: 'test-resource-id' },
          output: {
            markdown: '# Test Document\n\nThis is a test document.',
            title: 'Test Document',
          },
        });

        resourcesService.get.mockResolvedValue(mockResource as Resource);
        resourcesService.update.mockResolvedValue(undefined);

        const result = await processor.process(task);

        expect(result).toEqual({ resourceId: 'test-resource-id' });
        expect(attachmentsService.uploadAttachment).not.toHaveBeenCalled();
        expect(resourcesService.get).toHaveBeenCalledWith('test-resource-id');
        expect(resourcesService.update).toHaveBeenCalled();
      });
    });

    describe('image processing', () => {
      it('should process images and replace links in markdown', async () => {
        const base64Data =
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAHGArEkAAAAAElFTkSuQmCC';
        const task = createMockTask({
          payload: { resource_id: 'test-resource-id' },
          output: {
            markdown:
              '# Test Document\n\n![Image 1](temp://image1.png)\n\nSome text.\n\n![Image 2](temp://image2.jpg)',
            title: 'Test Document',
            images: [
              {
                name: 'image1.png',
                link: 'temp://image1.png',
                data: base64Data,
                mimetype: 'image/png',
              },
              {
                link: 'temp://image2.jpg',
                data: base64Data,
                mimetype: 'image/jpeg',
              },
            ],
          },
        });

        attachmentsService.uploadAttachment
          .mockResolvedValueOnce('attachment-id-1')
          .mockResolvedValueOnce('attachment-id-2');

        resourcesService.get.mockResolvedValue(mockResource as Resource);
        resourcesService.update.mockResolvedValue(undefined);

        const result = await processor.process(task);

        // Verify attachment uploads
        expect(attachmentsService.uploadAttachment).toHaveBeenCalledTimes(2);

        // First image upload
        expect(attachmentsService.uploadAttachment).toHaveBeenNthCalledWith(
          1,
          'test-namespace',
          'test-resource-id',
          'test-user',
          'image1.png',
          expect.any(Buffer),
          'image/png',
        );

        // Second image upload (should use link as name when name is not provided)
        expect(attachmentsService.uploadAttachment).toHaveBeenNthCalledWith(
          2,
          'test-namespace',
          'test-resource-id',
          'test-user',
          'temp://image2.jpg',
          expect.any(Buffer),
          'image/jpeg',
        );

        // Verify markdown was updated with new image URLs
        expect(task.output!.markdown).toBe(
          '# Test Document\n\n![Image 1](/api/v1/attachments/images/attachment-id-1)\n\nSome text.\n\n![Image 2](/api/v1/attachments/images/attachment-id-2)',
        );

        // Verify images array was cleared
        expect(task.output!.images).toBeUndefined();

        // Verify parent process was called
        expect(result).toEqual({ resourceId: 'test-resource-id' });
      });

      it('should handle multiple occurrences of the same image link', async () => {
        const base64Data =
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAHGArEkAAAAAElFTkSuQmCC';
        const task = createMockTask({
          payload: { resource_id: 'test-resource-id' },
          output: {
            markdown:
              '![Image](temp://image.png)\n\nText with ![same image](temp://image.png) again.',
            images: [
              {
                name: 'image.png',
                link: 'temp://image.png',
                data: base64Data,
                mimetype: 'image/png',
              },
            ],
          },
        });

        attachmentsService.uploadAttachment.mockResolvedValue('attachment-id');
        resourcesService.get.mockResolvedValue(mockResource as Resource);
        resourcesService.update.mockResolvedValue(undefined);

        await processor.process(task);

        expect(task.output!.markdown).toBe(
          '![Image](/api/v1/attachments/images/attachment-id)\n\nText with ![same image](/api/v1/attachments/images/attachment-id) again.',
        );
      });

      it('should throw BadRequestException when payload has no resource_id', async () => {
        const task = createMockTask({
          payload: {},
          output: {
            markdown: '![Image](temp://image.png)',
            images: [
              {
                link: 'temp://image.png',
                data: 'base64data',
                mimetype: 'image/png',
              },
            ],
          },
        });

        await expect(processor.process(task)).rejects.toThrow(
          BadRequestException,
        );
        await expect(processor.process(task)).rejects.toThrow(
          'Invalid task payload',
        );
      });

      it('should handle payload with resourceId instead of resource_id', async () => {
        const base64Data =
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAHGArEkAAAAAElFTkSuQmCC';
        const task = createMockTask({
          payload: { resourceId: 'test-resource-id' },
          output: {
            markdown: '![Image](temp://image.png)',
            images: [
              {
                link: 'temp://image.png',
                data: base64Data,
                mimetype: 'image/png',
              },
            ],
          },
        });

        attachmentsService.uploadAttachment.mockResolvedValue('attachment-id');
        resourcesService.get.mockResolvedValue(mockResource as Resource);
        resourcesService.update.mockResolvedValue(undefined);

        const result = await processor.process(task);

        expect(attachmentsService.uploadAttachment).toHaveBeenCalledWith(
          'test-namespace',
          'test-resource-id',
          'test-user',
          'temp://image.png',
          expect.any(Buffer),
          'image/png',
        );
        expect(result).toEqual({ resourceId: 'test-resource-id' });
      });

      it('should convert base64 data to Buffer correctly', async () => {
        const base64Data =
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAHGArEkAAAAAElFTkSuQmCC';
        const task = createMockTask({
          payload: { resource_id: 'test-resource-id' },
          output: {
            markdown: '![Image](temp://image.png)',
            images: [
              {
                link: 'temp://image.png',
                data: base64Data,
                mimetype: 'image/png',
              },
            ],
          },
        });

        attachmentsService.uploadAttachment.mockResolvedValue('attachment-id');
        resourcesService.get.mockResolvedValue(mockResource as Resource);
        resourcesService.update.mockResolvedValue(undefined);

        await processor.process(task);

        const uploadCall = attachmentsService.uploadAttachment.mock.calls[0];
        const bufferArg = uploadCall[4];

        expect(bufferArg).toBeInstanceOf(Buffer);
        expect(bufferArg.toString('base64')).toBe(base64Data);
      });
    });

    describe('inheritance from CollectProcessor', () => {
      it('should inherit exception handling from parent class', async () => {
        const task = createMockTask({
          payload: { resource_id: 'test-resource-id' },
          output: {
            markdown: '# Test Document',
          },
          exception: { error: 'Processing failed' },
        });

        resourcesService.update.mockResolvedValue(undefined);

        const result = await processor.process(task);

        // Should not process images when there's an exception
        expect(attachmentsService.uploadAttachment).not.toHaveBeenCalled();

        // Should call parent's exception handling
        expect(resourcesService.update).toHaveBeenCalledWith(
          'test-user',
          'test-resource-id',
          {
            namespaceId: 'test-namespace',
            content: 'Processing failed',
          },
        );
        expect(result).toEqual({});
      });

      it('should be instance of CollectProcessor', () => {
        const { CollectProcessor } = require('./collect.processor');
        expect(processor).toBeInstanceOf(CollectProcessor);
      });
    });

    describe('edge cases', () => {
      it('should handle empty images array', async () => {
        const task = createMockTask({
          payload: { resource_id: 'test-resource-id' },
          output: {
            markdown: '# Test Document',
            images: [],
          },
        });

        resourcesService.get.mockResolvedValue(mockResource as Resource);
        resourcesService.update.mockResolvedValue(undefined);

        const result = await processor.process(task);

        expect(attachmentsService.uploadAttachment).not.toHaveBeenCalled();
        expect(task.output!.images).toBeUndefined();
        expect(result).toEqual({ resourceId: 'test-resource-id' });
      });

      it('should handle markdown with no image links even when images array exists', async () => {
        const task = createMockTask({
          payload: { resource_id: 'test-resource-id' },
          output: {
            markdown: '# Test Document\n\nNo images here.',
            images: [
              {
                link: 'temp://image.png',
                data: 'base64data',
                mimetype: 'image/png',
              },
            ],
          },
        });

        attachmentsService.uploadAttachment.mockResolvedValue('attachment-id');
        resourcesService.get.mockResolvedValue(mockResource as Resource);
        resourcesService.update.mockResolvedValue(undefined);

        await processor.process(task);

        // Should still process images even if they're not in markdown
        expect(attachmentsService.uploadAttachment).toHaveBeenCalled();
        expect(task.output!.images).toBeUndefined();
      });
    });
  });
});
