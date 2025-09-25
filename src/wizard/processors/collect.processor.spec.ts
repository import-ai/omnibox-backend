/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CollectProcessor } from './collect.processor';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { TagService } from 'omniboxd/tag/tag.service';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { Resource } from 'omniboxd/resources/entities/resource.entity';

describe('CollectProcessor', () => {
  let processor: CollectProcessor;
  let namespaceResourcesService: jest.Mocked<NamespaceResourcesService>;
  let tagService: jest.Mocked<TagService>;

  const mockResource: Partial<Resource> = {
    id: 'test-resource-id',
    namespaceId: 'test-namespace',
    userId: 'test-user',
    name: 'Test Resource',
    attrs: { url: 'https://example.com' },
  };

  beforeEach(async () => {
    const mockResourcesService = {
      get: jest.fn(),
      update: jest.fn(),
    };

    const mockTagService = {
      getOrCreateTagsByNames: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: NamespaceResourcesService,
          useValue: mockResourcesService,
        },
        {
          provide: TagService,
          useValue: mockTagService,
        },
      ],
    }).compile();

    namespaceResourcesService = module.get(NamespaceResourcesService);
    tagService = module.get(TagService);
    processor = new CollectProcessor(namespaceResourcesService, tagService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('process', () => {
    const createMockTask = (overrides: Partial<Task> = {}): Task => ({
      id: 'test-task-id',
      namespaceId: 'test-namespace',
      userId: 'test-user',
      function: 'collect',
      input: { html: '<html>test</html>', url: 'https://example.com' },
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

    describe('payload validation', () => {
      it('should throw BadRequestException when payload is null', async () => {
        const task = createMockTask({ payload: null });

        await expect(processor.process(task)).rejects.toThrow(
          BadRequestException,
        );
        await expect(processor.process(task)).rejects.toThrow(
          'Invalid task payload',
        );
      });

      it('should throw BadRequestException when payload has no resource_id or resourceId', async () => {
        const task = createMockTask({ payload: {} });

        await expect(processor.process(task)).rejects.toThrow(
          BadRequestException,
        );
        await expect(processor.process(task)).rejects.toThrow(
          'Invalid task payload',
        );
      });

      it('should accept payload with resource_id', async () => {
        const task = createMockTask({
          payload: { resource_id: 'test-resource-id' },
          output: { markdown: 'test content' },
        });

        namespaceResourcesService.get.mockResolvedValue(
          mockResource as Resource,
        );
        namespaceResourcesService.update.mockResolvedValue(undefined);

        const result = await processor.process(task);
        expect(result).toEqual({ resourceId: 'test-resource-id' });
      });

      it('should accept payload with resourceId (alternative format)', async () => {
        const task = createMockTask({
          payload: { resourceId: 'test-resource-id' },
          output: { markdown: 'test content' },
        });

        namespaceResourcesService.get.mockResolvedValue(
          mockResource as Resource,
        );
        namespaceResourcesService.update.mockResolvedValue(undefined);

        const result = await processor.process(task);
        expect(result).toEqual({ resourceId: 'test-resource-id' });
      });
    });

    describe('exception handling', () => {
      it('should update resource with error content when task has exception', async () => {
        const task = createMockTask({
          payload: { resource_id: 'test-resource-id' },
          exception: { error: 'Processing failed' },
        });

        namespaceResourcesService.update.mockResolvedValue(undefined);

        const result = await processor.process(task);

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

      it('should not call namespaceResourcesService.get when task has exception', async () => {
        const task = createMockTask({
          payload: { resource_id: 'test-resource-id' },
          exception: { error: 'Processing failed' },
        });

        namespaceResourcesService.update.mockResolvedValue(undefined);

        await processor.process(task);

        expect(namespaceResourcesService.get).not.toHaveBeenCalled();
      });
    });

    describe('successful processing', () => {
      it('should update resource with output data when task is successful', async () => {
        const task = createMockTask({
          payload: { resource_id: 'test-resource-id' },
          output: {
            markdown: '# Test Content',
            title: 'Updated Title',
            customAttr: 'custom value',
          },
        });

        namespaceResourcesService.get.mockResolvedValue(
          mockResource as Resource,
        );
        namespaceResourcesService.update.mockResolvedValue(undefined);

        const result = await processor.process(task);

        expect(namespaceResourcesService.get).toHaveBeenCalledWith(
          'test-resource-id',
        );
        expect(namespaceResourcesService.update).toHaveBeenCalledWith(
          'test-user',
          'test-resource-id',
          {
            namespaceId: 'test-namespace',
            name: 'Updated Title',
            content: '# Test Content',
            attrs: {
              url: 'https://example.com',
              customAttr: 'custom value',
            },
          },
        );
        expect(result).toEqual({ resourceId: 'test-resource-id' });
      });

      it('should merge attrs with existing resource attrs', async () => {
        const task = createMockTask({
          payload: { resource_id: 'test-resource-id' },
          output: {
            markdown: 'content',
            title: 'title',
            newAttr: 'new value',
            url: 'https://updated.com', // This should override existing url
          },
        });

        const resourceWithAttrs = {
          ...mockResource,
          attrs: { url: 'https://example.com', existingAttr: 'existing value' },
        };

        namespaceResourcesService.get.mockResolvedValue(
          resourceWithAttrs as Resource,
        );
        namespaceResourcesService.update.mockResolvedValue(undefined);

        await processor.process(task);

        expect(namespaceResourcesService.update).toHaveBeenCalledWith(
          'test-user',
          'test-resource-id',
          {
            namespaceId: 'test-namespace',
            name: 'title',
            content: 'content',
            attrs: {
              existingAttr: 'existing value',
              newAttr: 'new value',
              url: 'https://updated.com',
            },
          },
        );
      });

      it('should handle resource with null attrs', async () => {
        const task = createMockTask({
          payload: { resource_id: 'test-resource-id' },
          output: {
            markdown: 'content',
            title: 'title',
            newAttr: 'new value',
          },
        });

        const resourceWithNullAttrs = {
          ...mockResource,
          attrs: null,
        };

        namespaceResourcesService.get.mockResolvedValue(
          resourceWithNullAttrs as unknown as Resource,
        );
        namespaceResourcesService.update.mockResolvedValue(undefined);

        await processor.process(task);

        expect(namespaceResourcesService.update).toHaveBeenCalledWith(
          'test-user',
          'test-resource-id',
          {
            namespaceId: 'test-namespace',
            name: 'title',
            content: 'content',
            attrs: {
              newAttr: 'new value',
            },
          },
        );
      });

      it('should handle output without title', async () => {
        const task = createMockTask({
          payload: { resource_id: 'test-resource-id' },
          output: {
            markdown: 'content without title',
          },
        });

        namespaceResourcesService.get.mockResolvedValue(
          mockResource as Resource,
        );
        namespaceResourcesService.update.mockResolvedValue(undefined);

        await processor.process(task);

        expect(namespaceResourcesService.update).toHaveBeenCalledWith(
          'test-user',
          'test-resource-id',
          {
            namespaceId: 'test-namespace',
            name: undefined,
            content: 'content without title',
            attrs: {
              url: 'https://example.com',
            },
          },
        );
      });

      it('should handle tags in metadata and return tagIds', async () => {
        const task = createMockTask({
          payload: { resource_id: 'test-resource-id' },
          output: {
            markdown: 'content',
            title: 'title',
            metadata: {
              tags: ['tag1', 'tag2', 'tag3'],
              otherMeta: 'value',
            },
          },
        });

        namespaceResourcesService.get.mockResolvedValue(
          mockResource as Resource,
        );
        namespaceResourcesService.update.mockResolvedValue(undefined);
        tagService.getOrCreateTagsByNames.mockResolvedValue([
          'id1',
          'id2',
          'id3',
        ]);

        const result = await processor.process(task);

        expect(tagService.getOrCreateTagsByNames).toHaveBeenCalledWith(
          'test-namespace',
          ['tag1', 'tag2', 'tag3'],
        );
        expect(namespaceResourcesService.update).toHaveBeenCalledWith(
          'test-user',
          'test-resource-id',
          {
            namespaceId: 'test-namespace',
            name: 'title',
            content: 'content',
            attrs: {
              url: 'https://example.com',
              metadata: {
                otherMeta: 'value',
              },
            },
            tag_ids: ['id1', 'id2', 'id3'],
          },
        );
        expect(result).toEqual({
          resourceId: 'test-resource-id',
          tagIds: ['id1', 'id2', 'id3'],
        });
      });

      it('should handle images in output and replace links', async () => {
        const task = createMockTask({
          payload: { resource_id: 'test-resource-id' },
          output: {
            markdown: 'content with ![image](http://example.com/image.png)',
            title: 'title',
            images: [
              {
                originalLink: 'http://example.com/image.png',
                attachmentId: 'attachment-123',
              },
            ],
          },
        });

        namespaceResourcesService.get.mockResolvedValue(
          mockResource as Resource,
        );
        namespaceResourcesService.update.mockResolvedValue(undefined);

        const result = await processor.process(task);

        expect(namespaceResourcesService.update).toHaveBeenCalledWith(
          'test-user',
          'test-resource-id',
          {
            namespaceId: 'test-namespace',
            name: 'title',
            content: 'content with ![image](attachments/attachment-123)',
            attrs: {
              url: 'https://example.com',
            },
            tag_ids: undefined,
          },
        );
        expect(result).toEqual({
          resourceId: 'test-resource-id',
          tagIds: undefined,
        });
      });
    });

    describe('edge cases', () => {
      it('should return empty object when task has no output and no exception', async () => {
        const task = createMockTask({
          payload: { resource_id: 'test-resource-id' },
          output: null,
          exception: null,
        });

        const result = await processor.process(task);

        expect(result).toEqual({});
        expect(namespaceResourcesService.get).not.toHaveBeenCalled();
        expect(namespaceResourcesService.update).not.toHaveBeenCalled();
      });

      it('should handle empty output object', async () => {
        const task = createMockTask({
          payload: { resource_id: 'test-resource-id' },
          output: {},
        });

        namespaceResourcesService.get.mockResolvedValue(
          mockResource as Resource,
        );
        namespaceResourcesService.update.mockResolvedValue(undefined);

        const result = await processor.process(task);

        expect(namespaceResourcesService.update).toHaveBeenCalledWith(
          'test-user',
          'test-resource-id',
          {
            namespaceId: 'test-namespace',
            name: undefined,
            content: '',
            attrs: {
              url: 'https://example.com',
            },
            tag_ids: undefined,
          },
        );
        expect(result).toEqual({
          resourceId: 'test-resource-id',
          tagIds: undefined,
        });
      });
    });
  });
});
