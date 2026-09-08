/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { Task, TaskStatus } from 'omniboxd/tasks/tasks.entity';

import { CollectUrlProcessor } from './collect-url.processor';

describe('CollectUrlProcessor', () => {
  let processor: CollectUrlProcessor;
  let namespaceResourcesService: jest.Mocked<NamespaceResourcesService>;
  let resourcesService: jest.Mocked<ResourcesService>;

  const mockResource: Partial<Resource> = {
    id: 'test-resource-id',
    namespaceId: 'test-namespace',
    userId: 'test-user',
    name: 'https://example.com',
  };

  beforeEach(async () => {
    const mockNamespaceResourcesService = {
      update: jest.fn(),
    };

    const mockResourcesService = {
      getResourceOrFail: jest.fn(),
    };

    const mockI18nService = {
      t: jest.fn((key: string) => {
        const translations: Record<string, string> = {
          'wizard.errors.invalidTaskPayload': 'Invalid task payload',
          'wizard.errors.failedResourceNamePrefix': 'error: ',
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
          provide: I18nService,
          useValue: mockI18nService,
        },
      ],
    }).compile();

    namespaceResourcesService = module.get(NamespaceResourcesService);
    resourcesService = module.get(ResourcesService);
    processor = new CollectUrlProcessor(
      namespaceResourcesService,
      resourcesService,
      module.get(I18nService),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockTask = (overrides: Partial<Task> = {}): Task => ({
    id: 'test-task-id',
    namespaceId: 'test-namespace',
    userId: 'test-user',
    function: 'collect_url',
    input: { url: 'https://example.com' },
    payload: { resource_id: 'test-resource-id' },
    output: null,
    exception: null,
    priority: '5',
    startedAt: new Date(),
    endedAt: null,
    canceledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    lastHeartbeat: null,
    resourceId: 'test-resource-id',
    workerId: null,
    status: TaskStatus.PENDING,
    numSchedules: 0,
    retriedFromTaskId: null,
    ...overrides,
  });

  describe('process', () => {
    it('should throw AppException when payload has no resource_id', async () => {
      const task = createMockTask({ payload: {} });
      await expect(processor.process(task)).rejects.toThrow(AppException);
    });

    it('should prefix resource name when collect_url fails', async () => {
      const task = createMockTask({
        exception: { error: 'scrape failed' },
      });
      resourcesService.getResourceOrFail.mockResolvedValue(
        mockResource as Resource,
      );
      namespaceResourcesService.update.mockResolvedValue(undefined);

      const result = await processor.process(task);

      expect(resourcesService.getResourceOrFail).toHaveBeenCalledWith(
        'test-namespace',
        'test-resource-id',
      );
      expect(namespaceResourcesService.update).toHaveBeenCalledWith(
        'test-namespace',
        'test-user',
        'test-resource-id',
        expect.objectContaining({
          namespaceId: 'test-namespace',
          name: 'error: https://example.com',
        }),
        true,
      );
      expect(result).toEqual({});
    });

    it('should prefix resource name when web_analysis fails after a scraped title', async () => {
      const task = createMockTask({
        function: 'web_analysis',
        exception: { error: 'analysis failed' },
      });
      resourcesService.getResourceOrFail.mockResolvedValue({
        ...mockResource,
        name: 'Example Title',
      } as Resource);
      namespaceResourcesService.update.mockResolvedValue(undefined);

      await processor.process(task);

      expect(namespaceResourcesService.update).toHaveBeenCalledWith(
        'test-namespace',
        'test-user',
        'test-resource-id',
        expect.objectContaining({
          name: 'error: Example Title',
        }),
        true,
      );
    });

    it('should not double-prefix resource name on retry', async () => {
      const task = createMockTask({
        exception: { error: 'scrape failed' },
      });
      resourcesService.getResourceOrFail.mockResolvedValue({
        ...mockResource,
        name: '失败：https://example.com',
      } as Resource);
      namespaceResourcesService.update.mockResolvedValue(undefined);

      await processor.process(task);

      expect(namespaceResourcesService.update).toHaveBeenCalledWith(
        'test-namespace',
        'test-user',
        'test-resource-id',
        expect.objectContaining({
          name: 'error: https://example.com',
        }),
        true,
      );
    });

    it('should update resource name from scraped title on success', async () => {
      const task = createMockTask({
        output: { title: 'Scraped Title' },
      });
      namespaceResourcesService.update.mockResolvedValue(undefined);

      const result = await processor.process(task);

      expect(resourcesService.getResourceOrFail).not.toHaveBeenCalled();
      expect(namespaceResourcesService.update).toHaveBeenCalledWith(
        'test-namespace',
        'test-user',
        'test-resource-id',
        expect.objectContaining({
          name: 'Scraped Title',
        }),
        true,
      );
      expect(result).toEqual({
        resourceId: 'test-resource-id',
        title: 'Scraped Title',
      });
    });

    it('should not update resource on successful web_analysis without title', async () => {
      const task = createMockTask({
        function: 'web_analysis',
        output: { is_video: true, is_audio: false },
      });

      const result = await processor.process(task);

      expect(namespaceResourcesService.update).not.toHaveBeenCalled();
      expect(result).toEqual({});
    });
  });
});
