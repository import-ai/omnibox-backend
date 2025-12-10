/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { ExtractTagsProcessor } from './extract-tags.processor';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { TagService } from 'omniboxd/tag/tag.service';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';

describe('ExtractTagsProcessor', () => {
  let processor: ExtractTagsProcessor;
  let namespaceResourcesService: jest.Mocked<NamespaceResourcesService>;
  let tagService: jest.Mocked<TagService>;
  let i18nService: jest.Mocked<I18nService>;

  beforeEach(async () => {
    const mockResourcesService = {
      update: jest.fn(),
    };

    const mockTagService = {
      getOrCreateTagsByNames: jest.fn(),
    };

    const mockI18nService = {
      t: jest.fn((key: string) => {
        // Return mock translations for test purposes
        const translations: Record<string, string> = {
          'wizard.errors.invalidTaskPayload':
            'Invalid task payload: missing resource_id',
        };
        return translations[key] || key;
      }),
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
        {
          provide: I18nService,
          useValue: mockI18nService,
        },
      ],
    }).compile();

    namespaceResourcesService = module.get(NamespaceResourcesService);
    tagService = module.get(TagService);
    i18nService = module.get(I18nService);
    processor = new ExtractTagsProcessor(
      namespaceResourcesService,
      tagService,
      i18nService,
    );
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
    enqueued: false,
    ...overrides,
  });

  describe('process', () => {
    it('should return empty object when task has no output', async () => {
      const task = createMockTask({ output: null });

      const result = await processor.process(task as any);

      expect(result).toEqual({});
      expect(namespaceResourcesService.update).not.toHaveBeenCalled();
    });

    it('should return empty object when task output has no tags', async () => {
      const task = createMockTask({ output: { markdown: 'some content' } });

      const result = await processor.process(task as any);

      expect(result).toEqual({});
      expect(namespaceResourcesService.update).not.toHaveBeenCalled();
    });

    it('should throw AppException when payload is missing resource_id', async () => {
      const task = createMockTask({
        payload: {},
        output: { tags: ['test'] },
      });

      await expect(processor.process(task as any)).rejects.toThrow(
        AppException,
      );
      await expect(processor.process(task as any)).rejects.toThrow(
        'Invalid task payload: missing resource_id',
      );
      expect(namespaceResourcesService.update).not.toHaveBeenCalled();
    });

    it('should process tags from external service output and update resource with existing tags', async () => {
      const task = createMockTask({
        output: { tags: ['test', 'important', 'javascript'] },
      });

      tagService.getOrCreateTagsByNames.mockResolvedValue([
        'tag-1',
        'tag-2',
        'tag-3',
      ]);

      namespaceResourcesService.update.mockResolvedValue(undefined);

      const result = await processor.process(task as any);

      expect(result.tags).toEqual(['test', 'important', 'javascript']);
      expect(result.tagIds).toEqual(['tag-1', 'tag-2', 'tag-3']);
      expect(result.resourceId).toBe('test-resource-id');

      expect(tagService.getOrCreateTagsByNames).toHaveBeenCalledWith(
        'test-namespace',
        ['test', 'important', 'javascript'],
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

    it('should create new tags when they do not exist', async () => {
      const task = createMockTask({
        output: { tags: ['new-tag', 'another-new-tag'] },
      });

      tagService.getOrCreateTagsByNames.mockResolvedValue([
        'new-tag-1',
        'new-tag-2',
      ]);

      namespaceResourcesService.update.mockResolvedValue(undefined);

      const result = await processor.process(task as any);

      expect(result.tags).toEqual(['new-tag', 'another-new-tag']);
      expect(result.tagIds).toEqual(['new-tag-1', 'new-tag-2']);
      expect(result.resourceId).toBe('test-resource-id');

      expect(tagService.getOrCreateTagsByNames).toHaveBeenCalledWith(
        'test-namespace',
        ['new-tag', 'another-new-tag'],
      );

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

      tagService.getOrCreateTagsByNames.mockResolvedValue([
        'existing-1',
        'new-1',
      ]);

      namespaceResourcesService.update.mockResolvedValue(undefined);

      const result = await processor.process(task as any);

      expect(result.tags).toEqual(['existing-tag', 'new-tag']);
      expect(result.tagIds).toEqual(['existing-1', 'new-1']);
      expect(result.resourceId).toBe('test-resource-id');

      expect(tagService.getOrCreateTagsByNames).toHaveBeenCalledWith(
        'test-namespace',
        ['existing-tag', 'new-tag'],
      );

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

      tagService.getOrCreateTagsByNames.mockResolvedValue([]);
      namespaceResourcesService.update.mockResolvedValue(undefined);

      const result = await processor.process(task as any);

      expect(result.tags).toEqual([]);
      expect(result.tagIds).toEqual([]);
      expect(result.resourceId).toBe('test-resource-id');

      expect(tagService.getOrCreateTagsByNames).toHaveBeenCalledWith(
        'test-namespace',
        [],
      );

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

      tagService.getOrCreateTagsByNames.mockResolvedValue([]);
      namespaceResourcesService.update.mockResolvedValue(undefined);

      const result = await processor.process(task as any);

      expect(result.tags).toEqual([]);
      expect(result.tagIds).toEqual([]);
      expect(result.resourceId).toBe('test-resource-id');

      expect(tagService.getOrCreateTagsByNames).toHaveBeenCalledWith(
        'test-namespace',
        [],
      );

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

      tagService.getOrCreateTagsByNames.mockResolvedValue([
        'tag-1',
        'tag-2',
        'tag-3',
      ]);

      namespaceResourcesService.update.mockResolvedValue(undefined);

      const result = await processor.process(task as any);

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

      expect(tagService.getOrCreateTagsByNames).toHaveBeenCalledWith(
        'test-namespace',
        [
          'valid-tag',
          '',
          null,
          undefined,
          123,
          ' whitespace-only ',
          'another-valid',
        ],
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

      const result = await processor.process(task as any);

      expect(result).toEqual({});
      expect(namespaceResourcesService.update).not.toHaveBeenCalled();
    });

    it('should handle task with both output and exception (exception takes precedence)', async () => {
      const task = createMockTask({
        output: { tags: ['test'] },
        exception: { error: 'Processing failed' },
      });

      const result = await processor.process(task as any);

      expect(result).toEqual({});
      expect(namespaceResourcesService.update).not.toHaveBeenCalled();
    });
  });
});
