/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ExtractTagsProcessor } from './extract-tags.processor';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { TagService } from 'omniboxd/tag/tag.service';
import { Task } from 'omniboxd/tasks/tasks.entity';

describe('ExtractTagsProcessor', () => {
  let processor: ExtractTagsProcessor;
  let namespaceResourcesService: jest.Mocked<NamespaceResourcesService>;
  let tagService: jest.Mocked<TagService>;

  beforeEach(async () => {
    const mockResourcesService = {
      update: jest.fn(),
    };

    const mockTagService = {
      findByName: jest.fn(),
      create: jest.fn(),
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
    processor = new ExtractTagsProcessor(namespaceResourcesService, tagService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockTask = (overrides: Partial<Task> = {}): Task => ({
    id: 'test-task-id',
    namespaceId: 'test-namespace',
    userId: 'test-user',
    function: 'extract_tags',
    input: { text: 'Sample text' },
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

  describe('process', () => {
    it('should return empty object when task has no output', async () => {
      const task = createMockTask({ output: null });

      const result = await processor.process(task);

      expect(result).toEqual({});
      expect(namespaceResourcesService.update).not.toHaveBeenCalled();
    });

    it('should return empty object when task output has no tags', async () => {
      const task = createMockTask({ output: { markdown: 'some content' } });

      const result = await processor.process(task);

      expect(result).toEqual({});
      expect(namespaceResourcesService.update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when payload is missing resource_id', async () => {
      const task = createMockTask({
        payload: {},
        output: { tags: ['test'] },
      });

      await expect(processor.process(task)).rejects.toThrow(
        BadRequestException,
      );
      await expect(processor.process(task)).rejects.toThrow(
        'Invalid task payload: missing resource_id',
      );
      expect(namespaceResourcesService.update).not.toHaveBeenCalled();
    });

    it('should process tags from external service output and update resource with existing tags', async () => {
      const task = createMockTask({
        output: { tags: ['test', 'important', 'javascript'] },
      });

      const mockTags = [
        {
          id: 'tag-1',
          name: 'test',
          namespaceId: 'test-namespace',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
        {
          id: 'tag-2',
          name: 'important',
          namespaceId: 'test-namespace',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
        {
          id: 'tag-3',
          name: 'javascript',
          namespaceId: 'test-namespace',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ];

      tagService.findByName
        .mockResolvedValueOnce(mockTags[0])
        .mockResolvedValueOnce(mockTags[1])
        .mockResolvedValueOnce(mockTags[2]);

      namespaceResourcesService.update.mockResolvedValue(undefined);

      const result = await processor.process(task);

      expect(result.tags).toEqual(['test', 'important', 'javascript']);
      expect(result.tagIds).toEqual(['tag-1', 'tag-2', 'tag-3']);
      expect(result.resourceId).toBe('test-resource-id');

      expect(tagService.findByName).toHaveBeenCalledTimes(3);
      expect(tagService.findByName).toHaveBeenCalledWith(
        'test-namespace',
        'test',
      );
      expect(tagService.findByName).toHaveBeenCalledWith(
        'test-namespace',
        'important',
      );
      expect(tagService.findByName).toHaveBeenCalledWith(
        'test-namespace',
        'javascript',
      );

      expect(tagService.create).not.toHaveBeenCalled();

      expect(namespaceResourcesService.update).toHaveBeenCalledWith(
        'test-user',
        'test-resource-id',
        {
          namespaceId: 'test-namespace',
          tag_ids: ['tag-1', 'tag-2', 'tag-3'],
        },
      );
    });

    it('should create new tags when they do not exist', async () => {
      const task = createMockTask({
        output: { tags: ['new-tag', 'another-new-tag'] },
      });

      const mockNewTags = [
        {
          id: 'new-tag-1',
          name: 'new-tag',
          namespaceId: 'test-namespace',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
        {
          id: 'new-tag-2',
          name: 'another-new-tag',
          namespaceId: 'test-namespace',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ];

      tagService.findByName
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      tagService.create
        .mockResolvedValueOnce(mockNewTags[0])
        .mockResolvedValueOnce(mockNewTags[1]);

      namespaceResourcesService.update.mockResolvedValue(undefined);

      const result = await processor.process(task);

      expect(result.tags).toEqual(['new-tag', 'another-new-tag']);
      expect(result.tagIds).toEqual(['new-tag-1', 'new-tag-2']);
      expect(result.resourceId).toBe('test-resource-id');

      expect(tagService.findByName).toHaveBeenCalledTimes(2);
      expect(tagService.create).toHaveBeenCalledTimes(2);
      expect(tagService.create).toHaveBeenCalledWith('test-namespace', {
        name: 'new-tag',
      });
      expect(tagService.create).toHaveBeenCalledWith('test-namespace', {
        name: 'another-new-tag',
      });

      expect(namespaceResourcesService.update).toHaveBeenCalledWith(
        'test-user',
        'test-resource-id',
        {
          namespaceId: 'test-namespace',
          tag_ids: ['new-tag-1', 'new-tag-2'],
        },
      );
    });

    it('should handle mix of existing and new tags', async () => {
      const task = createMockTask({
        output: { tags: ['existing-tag', 'new-tag'] },
      });

      const existingTag = {
        id: 'existing-1',
        name: 'existing-tag',
        namespaceId: 'test-namespace',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      const newTag = {
        id: 'new-1',
        name: 'new-tag',
        namespaceId: 'test-namespace',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      tagService.findByName
        .mockResolvedValueOnce(existingTag)
        .mockResolvedValueOnce(null);

      tagService.create.mockResolvedValueOnce(newTag);

      namespaceResourcesService.update.mockResolvedValue(undefined);

      const result = await processor.process(task);

      expect(result.tags).toEqual(['existing-tag', 'new-tag']);
      expect(result.tagIds).toEqual(['existing-1', 'new-1']);
      expect(result.resourceId).toBe('test-resource-id');

      expect(tagService.findByName).toHaveBeenCalledTimes(2);
      expect(tagService.create).toHaveBeenCalledTimes(1);
      expect(tagService.create).toHaveBeenCalledWith('test-namespace', {
        name: 'new-tag',
      });

      expect(namespaceResourcesService.update).toHaveBeenCalledWith(
        'test-user',
        'test-resource-id',
        {
          namespaceId: 'test-namespace',
          tag_ids: ['existing-1', 'new-1'],
        },
      );
    });

    it('should handle empty tags array from external service', async () => {
      const task = createMockTask({
        output: { tags: [] },
      });

      namespaceResourcesService.update.mockResolvedValue(undefined);

      const result = await processor.process(task);

      expect(result.tags).toEqual([]);
      expect(result.tagIds).toEqual([]);
      expect(result.resourceId).toBe('test-resource-id');

      expect(tagService.findByName).not.toHaveBeenCalled();
      expect(tagService.create).not.toHaveBeenCalled();

      expect(namespaceResourcesService.update).toHaveBeenCalledWith(
        'test-user',
        'test-resource-id',
        {
          namespaceId: 'test-namespace',
          tag_ids: [],
        },
      );
    });

    it('should handle non-array tags from external service', async () => {
      const task = createMockTask({
        output: { tags: 'not-an-array' },
      });

      namespaceResourcesService.update.mockResolvedValue(undefined);

      const result = await processor.process(task);

      expect(result.tags).toEqual([]);
      expect(result.tagIds).toEqual([]);
      expect(result.resourceId).toBe('test-resource-id');

      expect(tagService.findByName).not.toHaveBeenCalled();
      expect(tagService.create).not.toHaveBeenCalled();

      expect(namespaceResourcesService.update).toHaveBeenCalledWith(
        'test-user',
        'test-resource-id',
        {
          namespaceId: 'test-namespace',
          tag_ids: [],
        },
      );
    });

    it('should filter out non-string and empty tag names', async () => {
      const task = createMockTask({
        output: {
          tags: [
            'valid-tag',
            '',
            null,
            undefined,
            123,
            ' whitespace-only ',
            'another-valid',
          ],
        },
      });

      const mockTags = [
        {
          id: 'tag-1',
          name: 'valid-tag',
          namespaceId: 'test-namespace',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
        {
          id: 'tag-2',
          name: 'whitespace-only',
          namespaceId: 'test-namespace',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
        {
          id: 'tag-3',
          name: 'another-valid',
          namespaceId: 'test-namespace',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ];

      tagService.findByName
        .mockResolvedValueOnce(mockTags[0])
        .mockResolvedValueOnce(mockTags[1])
        .mockResolvedValueOnce(mockTags[2]);

      namespaceResourcesService.update.mockResolvedValue(undefined);

      const result = await processor.process(task);

      expect(result.tags).toEqual([
        'valid-tag',
        '',
        null,
        undefined,
        123,
        ' whitespace-only ',
        'another-valid',
      ]);
      expect(result.tagIds).toEqual(['tag-1', 'tag-2', 'tag-3']);
      expect(result.resourceId).toBe('test-resource-id');

      expect(tagService.findByName).toHaveBeenCalledTimes(3);
      expect(tagService.findByName).toHaveBeenCalledWith(
        'test-namespace',
        'valid-tag',
      );
      expect(tagService.findByName).toHaveBeenCalledWith(
        'test-namespace',
        'whitespace-only',
      );
      expect(tagService.findByName).toHaveBeenCalledWith(
        'test-namespace',
        'another-valid',
      );

      expect(namespaceResourcesService.update).toHaveBeenCalledWith(
        'test-user',
        'test-resource-id',
        {
          namespaceId: 'test-namespace',
          tag_ids: ['tag-1', 'tag-2', 'tag-3'],
        },
      );
    });

    it('should handle task exceptions and not update resource', async () => {
      const task = createMockTask({
        output: { tags: ['test'] },
        exception: { error: 'Processing failed' },
      });

      const result = await processor.process(task);

      expect(result).toEqual({});
      expect(namespaceResourcesService.update).not.toHaveBeenCalled();
    });

    it('should handle task with both output and exception (exception takes precedence)', async () => {
      const task = createMockTask({
        output: { tags: ['test'] },
        exception: { error: 'Processing failed' },
      });

      const result = await processor.process(task);

      expect(result).toEqual({});
      expect(namespaceResourcesService.update).not.toHaveBeenCalled();
    });
  });
});
