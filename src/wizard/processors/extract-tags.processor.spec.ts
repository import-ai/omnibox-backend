/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ExtractTagsProcessor } from './extract-tags.processor';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { Task } from 'omniboxd/tasks/tasks.entity';

describe('ExtractTagsProcessor', () => {
  let processor: ExtractTagsProcessor;
  let resourcesService: jest.Mocked<ResourcesService>;

  beforeEach(async () => {
    const mockResourcesService = {
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ResourcesService,
          useValue: mockResourcesService,
        },
      ],
    }).compile();

    resourcesService = module.get(ResourcesService);
    processor = new ExtractTagsProcessor(resourcesService);
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
      expect(resourcesService.update).not.toHaveBeenCalled();
    });

    it('should return empty object when task output has no tags', async () => {
      const task = createMockTask({ output: { markdown: 'some content' } });

      const result = await processor.process(task);

      expect(result).toEqual({});
      expect(resourcesService.update).not.toHaveBeenCalled();
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
      expect(resourcesService.update).not.toHaveBeenCalled();
    });

    it('should process tags from external service output and update resource', async () => {
      const task = createMockTask({
        output: { tags: ['test', 'important', 'javascript'] },
      });

      resourcesService.update.mockResolvedValue(undefined);

      const result = await processor.process(task);

      expect(result.tags).toEqual(['test', 'important', 'javascript']);
      expect(result.resourceId).toBe('test-resource-id');

      expect(resourcesService.update).toHaveBeenCalledWith(
        'test-user',
        'test-resource-id',
        {
          namespaceId: 'test-namespace',
          tag_ids: ['test', 'important', 'javascript'],
        },
      );
    });

    it('should handle empty tags array from external service', async () => {
      const task = createMockTask({
        output: { tags: [] },
      });

      resourcesService.update.mockResolvedValue(undefined);

      const result = await processor.process(task);

      expect(result.tags).toEqual([]);
      expect(result.resourceId).toBe('test-resource-id');
      expect(resourcesService.update).toHaveBeenCalledWith(
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

      resourcesService.update.mockResolvedValue(undefined);

      const result = await processor.process(task);

      expect(result.tags).toEqual([]);
      expect(result.resourceId).toBe('test-resource-id');
      expect(resourcesService.update).toHaveBeenCalledWith(
        'test-user',
        'test-resource-id',
        {
          namespaceId: 'test-namespace',
          tag_ids: [],
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
      expect(resourcesService.update).not.toHaveBeenCalled();
    });

    it('should handle task with both output and exception (exception takes precedence)', async () => {
      const task = createMockTask({
        output: { tags: ['test'] },
        exception: { error: 'Processing failed' },
      });

      const result = await processor.process(task);

      expect(result).toEqual({});
      expect(resourcesService.update).not.toHaveBeenCalled();
    });
  });
});
