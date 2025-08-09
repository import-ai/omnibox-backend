/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CollectProcessor } from './collect.processor';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { Resource } from 'omniboxd/resources/resources.entity';

describe('CollectProcessor', () => {
  let processor: CollectProcessor;
  let resourcesService: jest.Mocked<ResourcesService>;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ResourcesService,
          useValue: mockResourcesService,
        },
      ],
    }).compile();

    resourcesService = module.get(ResourcesService);
    processor = new CollectProcessor(resourcesService);
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

        resourcesService.get.mockResolvedValue(mockResource as Resource);
        resourcesService.update.mockResolvedValue(undefined);

        const result = await processor.process(task);
        expect(result).toEqual({ resourceId: 'test-resource-id' });
      });

      it('should accept payload with resourceId (alternative format)', async () => {
        const task = createMockTask({
          payload: { resourceId: 'test-resource-id' },
          output: { markdown: 'test content' },
        });

        resourcesService.get.mockResolvedValue(mockResource as Resource);
        resourcesService.update.mockResolvedValue(undefined);

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

        resourcesService.update.mockResolvedValue(undefined);

        const result = await processor.process(task);

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

      it('should not call resourcesService.get when task has exception', async () => {
        const task = createMockTask({
          payload: { resource_id: 'test-resource-id' },
          exception: { error: 'Processing failed' },
        });

        resourcesService.update.mockResolvedValue(undefined);

        await processor.process(task);

        expect(resourcesService.get).not.toHaveBeenCalled();
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

        resourcesService.get.mockResolvedValue(mockResource as Resource);
        resourcesService.update.mockResolvedValue(undefined);

        const result = await processor.process(task);

        expect(resourcesService.get).toHaveBeenCalledWith('test-resource-id');
        expect(resourcesService.update).toHaveBeenCalledWith(
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

        resourcesService.get.mockResolvedValue(resourceWithAttrs as Resource);
        resourcesService.update.mockResolvedValue(undefined);

        await processor.process(task);

        expect(resourcesService.update).toHaveBeenCalledWith(
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

        resourcesService.get.mockResolvedValue(
          resourceWithNullAttrs as unknown as Resource,
        );
        resourcesService.update.mockResolvedValue(undefined);

        await processor.process(task);

        expect(resourcesService.update).toHaveBeenCalledWith(
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

        resourcesService.get.mockResolvedValue(mockResource as Resource);
        resourcesService.update.mockResolvedValue(undefined);

        await processor.process(task);

        expect(resourcesService.update).toHaveBeenCalledWith(
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
        expect(resourcesService.get).not.toHaveBeenCalled();
        expect(resourcesService.update).not.toHaveBeenCalled();
      });

      it('should handle empty output object', async () => {
        const task = createMockTask({
          payload: { resource_id: 'test-resource-id' },
          output: {},
        });

        resourcesService.get.mockResolvedValue(mockResource as Resource);
        resourcesService.update.mockResolvedValue(undefined);

        const result = await processor.process(task);

        expect(resourcesService.update).toHaveBeenCalledWith(
          'test-user',
          'test-resource-id',
          {
            namespaceId: 'test-namespace',
            name: undefined,
            content: undefined,
            attrs: {
              url: 'https://example.com',
            },
          },
        );
        expect(result).toEqual({ resourceId: 'test-resource-id' });
      });
    });
  });
});
