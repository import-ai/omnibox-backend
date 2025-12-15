/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';
import { ReaderProcessor } from './reader.processor';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { TagService } from 'omniboxd/tag/tag.service';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';

describe('ReaderProcessor', () => {
  let processor: ReaderProcessor;
  let namespaceResourcesService: jest.Mocked<NamespaceResourcesService>;
  let resourcesService: jest.Mocked<ResourcesService>;
  let tagService: jest.Mocked<TagService>;
  let i18nService: jest.Mocked<I18nService>;

  const mockResource: Partial<Resource> = {
    id: 'test-resource-id',
    namespaceId: 'test-namespace',
    userId: 'test-user',
    name: 'Test Resource',
    attrs: { filename: 'test.pdf' },
  };

  beforeEach(async () => {
    const mockNamespaceResourcesService = {
      update: jest.fn(),
    };

    const mockResourcesService = {
      getResourceOrFail: jest.fn(),
    };

    const mockTagService = {
      getOrCreateTagsByNames: jest.fn(),
    };

    const mockI18nService = {
      t: jest.fn((key: string) => {
        // Return mock translations for test purposes
        const translations: Record<string, string> = {
          'wizard.errors.invalidTaskPayload': 'Invalid task payload',
        };
        return translations[key] || key;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: NamespaceResourcesService,
          useValue: mockNamespaceResourcesService,
        },
        {
          provide: ResourcesService,
          useValue: mockResourcesService,
        },
        {
          provide: TagService,
          useValue: mockTagService,
        },
        {
          provide: I18nService,
          useValue: mockI18nService,
        },
      ],
    }).compile();

    namespaceResourcesService = module.get(NamespaceResourcesService);
    resourcesService = module.get(ResourcesService);
    tagService = module.get(TagService);
    i18nService = module.get(I18nService);
    processor = new ReaderProcessor(
      namespaceResourcesService,
      resourcesService,
      tagService,
      i18nService,
    );
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
      enqueued: false,
      ...overrides,
    });

    describe('markdown processing', () => {
      it('should process task when output has no markdown', async () => {
        const task = createMockTask({
          output: { title: 'Test Document' },
        });

        resourcesService.getResourceOrFail.mockResolvedValue(
          mockResource as Resource,
        );
        namespaceResourcesService.update.mockResolvedValue(undefined);

        const result = await processor.process(task);

        expect(result).toEqual({
          resourceId: 'test-resource-id',
          tagIds: undefined,
        });
        expect(resourcesService.getResourceOrFail).toHaveBeenCalled();
        expect(namespaceResourcesService.update).toHaveBeenCalledWith(
          'test-user',
          'test-resource-id',
          {
            namespaceId: 'test-namespace',
            name: 'Test Document',
            content: '',
            attrs: {
              filename: 'test.pdf',
            },
            tag_ids: undefined,
          },
        );
      });

      it('should return empty object when output is null', async () => {
        const task = createMockTask({
          output: null,
        });

        const result = await processor.process(task);

        expect(result).toEqual({});
      });

      it('should process markdown without images and call parent process', async () => {
        const task = createMockTask({
          payload: { resource_id: 'test-resource-id' },
          output: {
            markdown: '# Test Document\n\nThis is a test document.',
            title: 'Test Document',
          },
        });

        resourcesService.getResourceOrFail.mockResolvedValue(
          mockResource as Resource,
        );
        namespaceResourcesService.update.mockResolvedValue(undefined);

        const result = await processor.process(task);

        expect(result).toEqual({ resourceId: 'test-resource-id' });
        expect(resourcesService.getResourceOrFail).toHaveBeenCalledWith(
          'test-namespace',
          'test-resource-id',
        );
        expect(namespaceResourcesService.update).toHaveBeenCalled();
      });
    });

    describe('image processing', () => {
      it('should process processed images and replace links in markdown', async () => {
        const task = createMockTask({
          payload: { resource_id: 'test-resource-id' },
          output: {
            markdown:
              '# Test Document\n\n![Image 1](temp://image1.png)\n\nSome text.\n\n![Image 2](temp://image2.jpg)',
            title: 'Test Document',
            images: [
              {
                originalLink: 'temp://image1.png',
                attachmentId: 'attachment-id-1',
                name: 'image1.png',
                mimetype: 'image/png',
              },
              {
                originalLink: 'temp://image2.jpg',
                attachmentId: 'attachment-id-2',
                mimetype: 'image/jpeg',
              },
            ],
          },
        });

        resourcesService.getResourceOrFail.mockResolvedValue(
          mockResource as Resource,
        );
        namespaceResourcesService.update.mockResolvedValue(undefined);

        const result = await processor.process(task);

        // Verify parent process was called and resource updated with processed markdown
        expect(result).toEqual({
          resourceId: 'test-resource-id',
          tagIds: undefined,
        });
        expect(namespaceResourcesService.update).toHaveBeenCalledWith(
          'test-user',
          'test-resource-id',
          {
            namespaceId: 'test-namespace',
            name: 'Test Document',
            content:
              '# Test Document\n\n![Image 1](attachments/attachment-id-1)\n\nSome text.\n\n![Image 2](attachments/attachment-id-2)',
            attrs: {
              filename: 'test.pdf',
            },
            tag_ids: undefined,
          },
        );
      });

      it('should handle multiple occurrences of the same image link', async () => {
        const task = createMockTask({
          payload: { resource_id: 'test-resource-id' },
          output: {
            markdown:
              '![Image](temp://image.png)\n\nText with ![same image](temp://image.png) again.',
            images: [
              {
                originalLink: 'temp://image.png',
                attachmentId: 'attachment-id',
                name: 'image.png',
                mimetype: 'image/png',
              },
            ],
          },
        });

        resourcesService.getResourceOrFail.mockResolvedValue(
          mockResource as Resource,
        );
        namespaceResourcesService.update.mockResolvedValue(undefined);

        const result = await processor.process(task);

        expect(result).toEqual({
          resourceId: 'test-resource-id',
          tagIds: undefined,
        });
        expect(namespaceResourcesService.update).toHaveBeenCalledWith(
          'test-user',
          'test-resource-id',
          {
            namespaceId: 'test-namespace',
            name: undefined,
            content:
              '![Image](attachments/attachment-id)\n\nText with ![same image](attachments/attachment-id) again.',
            attrs: {
              filename: 'test.pdf',
            },
            tag_ids: undefined,
          },
        );
      });

      it('should throw AppException when payload has no resource_id', async () => {
        const task = createMockTask({
          payload: {},
          output: {
            markdown: '![Image](temp://image.png)',
            images: [
              {
                originalLink: 'temp://image.png',
                attachmentId: 'attachment-id',
                mimetype: 'image/png',
              },
            ],
          },
        });

        await expect(processor.process(task)).rejects.toThrow(AppException);
        await expect(processor.process(task)).rejects.toThrow(
          'Invalid task payload',
        );
      });

      it('should handle payload with resourceId instead of resource_id', async () => {
        const task = createMockTask({
          payload: { resourceId: 'test-resource-id' },
          output: {
            markdown: '![Image](temp://image.png)',
            images: [
              {
                originalLink: 'temp://image.png',
                attachmentId: 'attachment-id',
                mimetype: 'image/png',
              },
            ],
          },
        });

        resourcesService.getResourceOrFail.mockResolvedValue(
          mockResource as Resource,
        );
        namespaceResourcesService.update.mockResolvedValue(undefined);

        const result = await processor.process(task);

        expect(result).toEqual({
          resourceId: 'test-resource-id',
          tagIds: undefined,
        });
        expect(namespaceResourcesService.update).toHaveBeenCalledWith(
          'test-user',
          'test-resource-id',
          {
            namespaceId: 'test-namespace',
            name: undefined,
            content: '![Image](attachments/attachment-id)',
            attrs: {
              filename: 'test.pdf',
            },
            tag_ids: undefined,
          },
        );
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

        namespaceResourcesService.update.mockResolvedValue(undefined);

        const result = await processor.process(task);

        // Should not process images when there's an exception

        // Should call parent's exception handling
        expect(namespaceResourcesService.update).toHaveBeenCalledWith(
          'test-user',
          'test-resource-id',
          {
            namespaceId: 'test-namespace',
            content: 'error',
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

        resourcesService.getResourceOrFail.mockResolvedValue(
          mockResource as Resource,
        );
        namespaceResourcesService.update.mockResolvedValue(undefined);

        const result = await processor.process(task);

        expect(result).toEqual({
          resourceId: 'test-resource-id',
          tagIds: undefined,
        });
        expect(namespaceResourcesService.update).toHaveBeenCalledWith(
          'test-user',
          'test-resource-id',
          {
            namespaceId: 'test-namespace',
            name: undefined,
            content: '# Test Document',
            attrs: {
              filename: 'test.pdf',
            },
            tag_ids: undefined,
          },
        );
      });

      it('should handle markdown with no image links even when images array exists', async () => {
        const task = createMockTask({
          payload: { resource_id: 'test-resource-id' },
          output: {
            markdown: '# Test Document\n\nNo images here.',
            images: [
              {
                originalLink: 'temp://image.png',
                attachmentId: 'attachment-id',
                mimetype: 'image/png',
              },
            ],
          },
        });

        resourcesService.getResourceOrFail.mockResolvedValue(
          mockResource as Resource,
        );
        namespaceResourcesService.update.mockResolvedValue(undefined);

        const result = await processor.process(task);

        expect(result).toEqual({
          resourceId: 'test-resource-id',
          tagIds: undefined,
        });
        expect(namespaceResourcesService.update).toHaveBeenCalledWith(
          'test-user',
          'test-resource-id',
          {
            namespaceId: 'test-namespace',
            name: undefined,
            content: '# Test Document\n\nNo images here.',
            attrs: {
              filename: 'test.pdf',
            },
            tag_ids: undefined,
          },
        );
      });

      it('empty dict exception', async () => {
        const task = createMockTask({
          exception: {},
          output: {
            markdown: '# Test Document',
          },
        });

        resourcesService.getResourceOrFail.mockResolvedValue(
          mockResource as Resource,
        );
        namespaceResourcesService.update.mockResolvedValue(undefined);

        const result = await processor.process(task);
        expect(result).toEqual({ resourceId: 'test-resource-id' });
      });
    });
  });
});
