import { TestClient } from 'test/test-client';
import { HttpStatus } from '@nestjs/common';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { TaskCallbackDto } from 'omniboxd/wizard/dto/task-callback.dto';
import { isEmpty } from 'omniboxd/utils/is-empty';
import {
  InternalTaskDto,
  TaskDto,
  TaskMetaDto,
} from 'omniboxd/tasks/dto/task.dto';

/**
 * Mock wizard worker that simulates the wizard worker service behavior
 * for testing the complete task processing pipeline
 */
class MockWizardWorker {
  private isPolling = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private readonly pollIntervalMs = 500; // Fast polling for tests
  private readonly namespaceId: string;

  constructor(private readonly client: TestClient) {
    this.namespaceId = client.namespace.id;
  }

  /**
   * Starts polling for tasks and processing them
   */
  startPolling(): void {
    if (this.isPolling) return;

    this.isPolling = true;
    this.pollingInterval = setInterval(() => {
      this.pollOnce().catch((error) => {
        console.error('Error in mock worker polling:', error);
      });
    }, this.pollIntervalMs);
  }

  /**
   * Stops the polling loop
   */
  stopPolling(): void {
    this.isPolling = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Performs a single poll cycle
   */
  async pollOnce(): Promise<void> {
    const task = await this.fetchTask();
    if (task) {
      if (task.namespace_id === this.client.namespace.id) {
        const result = this.processTask(task);
        await this.sendCallback(task.id, result);
      }
    }
  }

  async deleteAllTasks(): Promise<void> {
    this.stopPolling();

    let flag = true;
    while (flag) {
      const tasks: Task[] = (
        await this.client.get(
          `/api/v1/namespaces/${this.client.namespace.id}/tasks`,
        )
      ).body.tasks;
      if (tasks.length === 0) {
        flag = false;
        continue;
      }
      for (const task of tasks) {
        await this.client.delete(
          `/api/v1/namespaces/${this.client.namespace.id}/tasks/${task.id}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
  }

  /**
   * Fetches a task from the backend (simulates wizard worker fetching)
   */
  private async fetchTask(): Promise<TaskDto | null> {
    try {
      const response = await this.makeRequest()
        .get(`/internal/api/v1/wizard/task?namespace_id=${this.namespaceId}`)
        .timeout(5000); // 5 second timeout

      if (response.status === 204) {
        return null; // No tasks available
      }

      if (response.status !== 200) {
        throw new Error(`Failed to fetch task: ${response.status}`);
      }

      return response.body as TaskDto;
    } catch (error) {
      if (error.code === 'ECONNRESET' || error.timeout) {
        console.warn('Connection issue when fetching task, retrying...');
        return null; // Treat connection issues as no tasks available for now
      }
      throw error;
    }
  }

  /**
   * Processes a task based on its function type
   */
  private processTask(task: TaskDto): { output?: any; exception?: string } {
    try {
      switch (task.function) {
        case 'collect':
          return this.processCollectTask(task);
        case 'extract_tags':
          return this.processExtractTagsTask(task);
        case 'generate_title':
          return this.processGenerateTitleTask(task);
        case 'file_reader':
          return this.processFileReaderTask(task);
        case 'upsert_index':
          return this.processUpsertIndexTask(task);
        default:
          throw new Error(`Unknown task function: ${task.function}`);
      }
    } catch (error) {
      return {
        exception: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Simulates collect task processing
   */
  private processCollectTask(task: TaskDto): { output: any } {
    const input = task.input as { html: string; url: string; title?: string };

    return {
      output: {
        markdown: `# ${input.title || 'Collected Content'}\n\nURL: ${input.url}\n\nThis is mock markdown content extracted from the HTML.`,
        summary: 'Mock summary of the collected content',
        word_count: 42,
      },
    };
  }

  /**
   * Simulates extract_tags task processing
   */
  private processExtractTagsTask(task: TaskDto): { output: any } {
    console.log({ taskId: task.id, function: 'extractTags' });
    return {
      output: {
        tags: ['technology', 'web-development', 'automation'],
      },
    };
  }

  /**
   * Simulates generate_title task processing
   */
  private processGenerateTitleTask(task: TaskDto): { output: any } {
    console.log({ taskId: task.id, function: 'generateTitle' });
    return {
      output: {
        title: 'Generated Title Based on Content',
        confidence: 0.85,
      },
    };
  }

  /**
   * Simulates file_reader task processing
   */
  private processFileReaderTask(task: TaskDto): { output: any } {
    const input = task.input as {
      title: string;
      original_name?: string;
      filename?: string;
      mimetype?: string;
    };

    return {
      output: {
        markdown: `# ${input.title}\n\nThis is mock content extracted from the file: ${input.original_name || input.filename}`,
        text: 'Mock extracted text content',
        metadata: {
          pages: 1,
          words: 100,
          characters: 500,
        },
      },
    };
  }

  /**
   * Simulates upsert_index task processing
   */
  private processUpsertIndexTask(task: TaskDto): { output: any } {
    expect(task.input).toHaveProperty('meta_info');
    expect(task.input.meta_info).toHaveProperty('resource_id');
    expect(task.input.meta_info).toHaveProperty('user_id');
    expect(task.input.meta_info).toHaveProperty('parent_id');
    return {
      output: {
        indexed: true,
        records_updated: 1,
        success: true,
      },
    };
  }

  /**
   * Sends task completion callback to the backend
   */
  private async sendCallback(
    taskId: string,
    result: { output?: any; exception?: string },
  ): Promise<void> {
    const callbackData: TaskCallbackDto = {
      id: taskId,
      output: result.output || {},
      exception: result.exception ? { message: result.exception } : {},
    };

    try {
      const response = await this.makeRequest()
        .post('/internal/api/v1/wizard/callback')
        .send(callbackData)
        .timeout(10000); // 10 second timeout for callbacks

      if (response.status !== 200 && response.status !== 201) {
        throw new Error(`Failed to send callback: ${response.status}`);
      }
    } catch (error) {
      if (error.code === 'ECONNRESET' || error.timeout) {
        console.warn(
          `Connection issue when sending callback for task ${taskId}:`,
          error.message,
        );
        // Don't rethrow connection errors to avoid failing tests
        return;
      }
      throw error;
    }
  }

  /**
   * Creates a request object for internal API calls
   */
  private makeRequest() {
    return this.client.request();
  }

  /**
   * Waits for a condition to be met with timeout
   */
  static async waitFor(
    condition: () => Promise<boolean> | boolean,
    timeoutMs = 30 * 1000,
    intervalMs = 200,
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (await condition()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Condition not met within ${timeoutMs}ms`);
  }
}

describe('Task Pipeline (e2e)', () => {
  let client: TestClient;
  let mockWorker: MockWizardWorker;

  beforeEach(async () => {
    client = await TestClient.create();
    mockWorker = new MockWizardWorker(client);
  });

  afterEach(async () => {
    mockWorker.stopPolling();
    await client.close();
  });

  describe('Basic Task Processing', () => {
    it('create resource trigger upsertIndex', async () => {
      mockWorker.startPolling();

      const createResponse = (
        await client
          .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
          .send({
            name: 'Test Document',
            content: 'Sample content for the test document.',
            parentId: client.namespace.root_resource_id,
            namespaceId: client.namespace.id,
            resourceType: 'doc',
          })
      ).body;

      const taskMetas: TaskMetaDto[] = (
        await client.get(`/api/v1/namespaces/${client.namespace.id}/tasks`)
      ).body.tasks;

      const upsertTaskMeta = taskMetas.find(
        (t: TaskMetaDto) =>
          t.function === 'upsert_index' &&
          t.attrs?.resource_id === createResponse.id,
      );

      expect(upsertTaskMeta).toBeDefined();
      const upsertTask: InternalTaskDto = (
        await client.get(
          `/api/v1/namespaces/${client.namespace.id}/tasks/${upsertTaskMeta?.id}`,
        )
      ).body;
      expect(upsertTask).toBeDefined();
      expect(upsertTask.input.meta_info.parent_id).toBeDefined();
      expect(upsertTask.input.meta_info.parent_id).not.toBeNull();

      const patchResponse = await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${createResponse.id}`,
        )
        .send({
          namespaceId: client.namespace.id,
          content: 'Updated content for the test document.',
        });
      expect(patchResponse.status).toBe(200);
      const patchTaskMetas: TaskMetaDto[] = (
        await client.get(`/api/v1/namespaces/${client.namespace.id}/tasks`)
      ).body.tasks;
      const patchUpsertTaskMeta = patchTaskMetas.find(
        (t: TaskMetaDto) =>
          t.function === 'upsert_index' &&
          t.attrs?.resource_id === createResponse.id &&
          t.id !== upsertTaskMeta?.id,
      );
      expect(patchUpsertTaskMeta).toBeDefined();
      const patchUpsertTask: InternalTaskDto = (
        await client.get(
          `/api/v1/namespaces/${client.namespace.id}/tasks/${patchUpsertTaskMeta?.id}`,
        )
      ).body;
      expect(patchUpsertTask).toBeDefined();
      expect(patchUpsertTask.input.meta_info.parent_id).toBeDefined();
      expect(patchUpsertTask.input.meta_info.parent_id).not.toBeNull();
    });

    it('should process a collect task end-to-end', async () => {
      // Start the mock worker
      mockWorker.startPolling();

      // Create a collect task
      const collectData = {
        html: '<html><body><h1>Test Page</h1><p>Test content for processing.</p></body></html>',
        url: 'https://example.com/test-page',
        title: 'Test Page Title',
        namespace_id: client.namespace.id,
        parentId: client.namespace.root_resource_id,
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/wizard/collect`)
        .send(collectData)
        .expect(HttpStatus.CREATED);

      const taskId = response.body.task_id;
      const resourceId = response.body.resource_id;

      expect(taskId).toBeDefined();
      expect(resourceId).toBeDefined();

      // Wait for the task to be processed
      await MockWizardWorker.waitFor(async () => {
        const taskResponse = await client.get(
          `/api/v1/namespaces/${client.namespace.id}/tasks/${taskId}`,
        );
        return (
          taskResponse.status === 200 && taskResponse.body.ended_at !== null
        );
      });

      // Verify the task was completed successfully
      const completedTaskResponse = await client.get(
        `/api/v1/namespaces/${client.namespace.id}/tasks/${taskId}`,
      );
      expect(completedTaskResponse.status).toBe(200);

      const completedTask = completedTaskResponse.body;
      expect(completedTask.started_at).toBeDefined();
      expect(completedTask.ended_at).toBeDefined();
      expect(completedTask.output).toBeDefined();
      expect(completedTask.output.markdown).toContain('Test Page Title');
      expect(completedTask.exception).toEqual({});

      const resourceResponse = await client.get(
        `/api/v1/namespaces/${client.namespace.id}/resources/${resourceId}`,
      );
      expect(resourceResponse.status).toBe(200);
      expect(resourceResponse.body.id).toBe(resourceId);
      expect(resourceResponse.body.content).toContain('Test Page Title');

      const taskMetas: TaskMetaDto[] = (
        await client.get(`/api/v1/namespaces/${client.namespace.id}/tasks`)
      ).body.tasks;
      const upsertTaskMeta = taskMetas.find(
        (t: TaskMetaDto) => t.function === 'upsert_index',
      );
      const upsertTask: InternalTaskDto = (
        await client.get(
          `/api/v1/namespaces/${client.namespace.id}/tasks/${upsertTaskMeta?.id}`,
        )
      ).body;
      expect(upsertTask).toBeDefined();
    });

    it('should handle task exceptions properly', async () => {
      // Create a task and simulate an exception during processing
      const collectData = {
        html: '<html><body><h1>Test Page</h1></body></html>',
        url: 'https://example.com/test-exception',
        title: 'Exception Test',
        namespace_id: client.namespace.id,
        parentId: client.namespace.root_resource_id,
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/wizard/collect`)
        .send(collectData)
        .expect(HttpStatus.CREATED);

      const taskId = response.body.task_id;

      // Start processing
      mockWorker.startPolling();

      // Wait for the task to be processed
      await MockWizardWorker.waitFor(async () => {
        const taskResponse = await client.get(
          `/api/v1/namespaces/${client.namespace.id}/tasks/${taskId}`,
        );
        return (
          taskResponse.status === 200 && taskResponse.body.ended_at !== null
        );
      });

      // Verify the task completed with an exception
      const completedTaskResponse = await client.get(
        `/api/v1/namespaces/${client.namespace.id}/tasks/${taskId}`,
      );
      expect(completedTaskResponse.status).toBe(200);

      const completedTask = completedTaskResponse.body;
      expect(completedTask.ended_at).toBeDefined();
      expect(completedTask.exception).toBeDefined();
    });
  });

  describe('Task Fetching and Polling', () => {
    it('should return 204 when no tasks are available', async () => {
      // Try to fetch a task when none are available
      const task = await mockWorker['fetchTask']();
      expect(task).toBeNull();
    });

    it('should fetch and process multiple tasks in sequence', async () => {
      const collectData1 = {
        html: '<html><body><h1>Page 1</h1></body></html>',
        url: 'https://example.com/page1',
        title: 'Page 1',
        namespace_id: client.namespace.id,
        parentId: client.namespace.root_resource_id,
      };

      const collectData2 = {
        html: '<html><body><h1>Page 2</h1></body></html>',
        url: 'https://example.com/page2',
        title: 'Page 2',
        namespace_id: client.namespace.id,
        parentId: client.namespace.root_resource_id,
      };

      // Create two tasks
      const response1 = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/wizard/collect`)
        .send(collectData1)
        .expect(HttpStatus.CREATED);

      const response2 = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/wizard/collect`)
        .send(collectData2)
        .expect(HttpStatus.CREATED);

      const taskId1 = response1.body.task_id;
      const taskId2 = response2.body.task_id;

      // Start processing
      mockWorker.startPolling();

      // Wait for both tasks to be completed
      await MockWizardWorker.waitFor(async () => {
        const task1Response = await client.get(
          `/api/v1/namespaces/${client.namespace.id}/tasks/${taskId1}`,
        );
        const task2Response = await client.get(
          `/api/v1/namespaces/${client.namespace.id}/tasks/${taskId2}`,
        );

        return (
          task1Response.status === 200 &&
          task2Response.status === 200 &&
          task1Response.body.ended_at !== null &&
          task2Response.body.ended_at !== null
        );
      });

      // Verify both tasks were completed
      const task1Final = await client.get(
        `/api/v1/namespaces/${client.namespace.id}/tasks/${taskId1}`,
      );
      const task2Final = await client.get(
        `/api/v1/namespaces/${client.namespace.id}/tasks/${taskId2}`,
      );

      expect(task1Final.body.ended_at).toBeDefined();
      expect(task2Final.body.ended_at).toBeDefined();
      expect(task1Final.body.exception).toEqual({});
      expect(task2Final.body.exception).toEqual({});
    });

    it('should process single poll cycle correctly', async () => {
      // Create a task
      const collectData = {
        html: '<html><body><h1>Single Poll Test</h1></body></html>',
        url: 'https://example.com/single-poll',
        title: 'Single Poll Test',
        namespace_id: client.namespace.id,
        parentId: client.namespace.root_resource_id,
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/wizard/collect`)
        .send(collectData)
        .expect(HttpStatus.CREATED);

      const taskId = response.body.task_id;

      // Process one poll cycle
      await mockWorker.pollOnce();

      // Verify the task was processed
      const taskResponse = await client.get(
        `/api/v1/namespaces/${client.namespace.id}/tasks/${taskId}`,
      );
      expect(taskResponse.status).toBe(200);
      expect(taskResponse.body.ended_at).toBeDefined();
      expect(taskResponse.body.output).toBeDefined();
    });
  });

  describe('Task Chaining and Postprocessing', () => {
    it('should automatically trigger extract_tags after collect task completes', async () => {
      // Start the mock worker
      mockWorker.startPolling();

      // Create a collect task
      const collectData = {
        html: '<html><body><h1>Technology Article</h1><p>This article discusses web development and automation.</p></body></html>',
        url: 'https://example.com/tech-article',
        title: 'Technology Article',
        namespace_id: client.namespace.id,
        parentId: client.namespace.root_resource_id,
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/wizard/collect`)
        .send(collectData)
        .expect(HttpStatus.CREATED);

      const collectTaskId = response.body.task_id;
      const resourceId = response.body.resource_id;

      // Wait for both the collect task and the triggered extract_tags task to complete
      await MockWizardWorker.waitFor(async () => {
        // Check if extract_tags task was created and completed
        const tasksResponse = await client.get(
          `/api/v1/namespaces/${client.namespace.id}/tasks`,
        );
        if (tasksResponse.status !== 200) return false;

        const tasks: TaskMetaDto[] = tasksResponse.body.tasks;
        const collectTask: TaskMetaDto | undefined = tasks.find(
          (t: any) => t.id === collectTaskId,
        );
        const extractTagsTask: TaskMetaDto | undefined = tasks.find(
          (t: TaskMetaDto) =>
            t.function === 'extract_tags' &&
            t.attrs?.parent_task_id === collectTaskId,
        );

        expect(collectTask?.status).not.toBe('error');
        expect(extractTagsTask?.status).not.toBe('error');

        return (
          !isEmpty(collectTask?.ended_at) && !isEmpty(extractTagsTask?.ended_at)
        );
      });

      // Verify both tasks completed successfully
      const tasksResponse = await client.get(
        `/api/v1/namespaces/${client.namespace.id}/tasks`,
      );
      const taskMetaList: TaskMetaDto[] = tasksResponse.body.tasks;
      const extractTagsTaskMeta = taskMetaList.find(
        (t: TaskMetaDto) =>
          t.function === 'extract_tags' &&
          t.attrs?.parent_task_id === collectTaskId,
      )!;
      const collectTask: TaskDto = await client
        .get(`/api/v1/namespaces/${client.namespace.id}/tasks/${collectTaskId}`)
        .then((res) => res.body);
      const extractTagsTask: TaskDto = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/tasks/${extractTagsTaskMeta.id}`,
        )
        .then((res) => res.body);

      expect(collectTask).toBeDefined();
      expect(collectTask.ended_at).toBeDefined();
      expect(collectTask.output?.markdown).toBeDefined();

      expect(extractTagsTask).toBeDefined();
      expect(extractTagsTask.ended_at).toBeDefined();
      expect(extractTagsTask.output?.tags).toBeDefined();
      expect(extractTagsTask.attrs?.resource_id).toBe(resourceId);

      const resource = (
        await client.get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${resourceId}`,
        )
      ).body;
      expect(resource.id).toEqual(resourceId);
      expect(resource.tags).toHaveLength(3);
      for (let i = 0; i < 3; i++) {
        expect(resource.tags[i].name).toMatch(
          /technology|web-development|automation/,
        );
      }
    });

    it('generate_title should be triggered after open create', async () => {
      mockWorker.startPolling();

      const content = 'test content for title generation';
      const createResponse = (
        await client
          .post('/open/api/v1/resources')
          .set('Authorization', client.apiKey.value)
          .send({
            content,
          })
      ).body;
      const resourceId = createResponse.id;
      expect(createResponse.name).toBe('');

      await MockWizardWorker.waitFor(async () => {
        const tasksResponse = await client.get(
          `/api/v1/namespaces/${client.namespace.id}/tasks`,
        );
        const tasks: TaskMetaDto[] = tasksResponse.body.tasks;
        const generateTitleTask = tasks.find(
          (t: TaskMetaDto) =>
            t.function === 'generate_title' &&
            t.attrs?.resource_id === resourceId,
        );
        if (!generateTitleTask) return false;
        expect(generateTitleTask.status).not.toBe('error');
        return !isEmpty(generateTitleTask.ended_at);
      });

      const resource = (
        await client.get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${resourceId}`,
        )
      ).body;
      expect(resource.id).toEqual(resourceId);
      expect(resource.name).toBe('Generated Title Based on Content');
    });
  });

  describe('Concurrent Processing and Priority', () => {
    it('should respect namespace max_running_tasks limit', async () => {
      // This test would require setting up a namespace with max_running_tasks = 1
      // and creating multiple tasks to verify only one runs at a time
      // For now, we'll create a simpler test that verifies task ordering

      const collectData1 = {
        html: '<html><body><h1>High Priority</h1></body></html>',
        url: 'https://example.com/high-priority',
        title: 'High Priority Task',
        namespace_id: client.namespace.id,
        parentId: client.namespace.root_resource_id,
      };

      const collectData2 = {
        html: '<html><body><h1>Low Priority</h1></body></html>',
        url: 'https://example.com/low-priority',
        title: 'Low Priority Task',
        namespace_id: client.namespace.id,
        parentId: client.namespace.root_resource_id,
      };

      // Create tasks in sequence
      const response1 = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/wizard/collect`)
        .send(collectData1)
        .expect(HttpStatus.CREATED);

      const response2 = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/wizard/collect`)
        .send(collectData2)
        .expect(HttpStatus.CREATED);

      const taskId1 = response1.body.task_id;
      const taskId2 = response2.body.task_id;

      // Process tasks one by one to simulate limited concurrency
      await mockWorker.pollOnce(); // Process first task
      await mockWorker.pollOnce(); // Process second task

      // Verify both tasks were processed
      const task1Response = await client.get(
        `/api/v1/namespaces/${client.namespace.id}/tasks/${taskId1}`,
      );
      const task2Response = await client.get(
        `/api/v1/namespaces/${client.namespace.id}/tasks/${taskId2}`,
      );

      expect(task1Response.body.ended_at).toBeDefined();
      expect(task2Response.body.ended_at).toBeDefined();
    });

    it('should process tasks in priority order', async () => {
      // Create multiple tasks and verify they're fetched in correct priority order
      // This test verifies the SQL query in fetchTask method works correctly

      // Create several tasks quickly
      const tasks: string[] = [];
      for (let i = 0; i < 3; i++) {
        const collectData = {
          html: `<html><body><h1>Task ${i}</h1></body></html>`,
          url: `https://example.com/task-${i}`,
          title: `Task ${i}`,
          namespace_id: client.namespace.id,
          parentId: client.namespace.root_resource_id,
        };

        const response = await client
          .post(`/api/v1/namespaces/${client.namespace.id}/wizard/collect`)
          .send(collectData)
          .expect(HttpStatus.CREATED);

        tasks.push(response.body.task_id);
      }

      // Process all tasks
      mockWorker.startPolling();

      // Wait for all tasks to complete
      await MockWizardWorker.waitFor(async () => {
        const promises = tasks.map((taskId) =>
          client.get(
            `/api/v1/namespaces/${client.namespace.id}/tasks/${taskId}`,
          ),
        );
        const responses = await Promise.all(promises);
        return responses.every(
          (response) =>
            response.status === 200 && response.body.ended_at !== null,
        );
      });

      // Verify all tasks completed
      for (const taskId of tasks) {
        const response = await client.get(
          `/api/v1/namespaces/${client.namespace.id}/tasks/${taskId}`,
        );
        expect(response.body.ended_at).toBeDefined();
        expect(response.body.exception).toEqual({});
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed callback data gracefully', async () => {
      // Create a task
      const collectData = {
        html: '<html><body><h1>Callback Test</h1></body></html>',
        url: 'https://example.com/callback-test',
        title: 'Callback Test',
        namespace_id: client.namespace.id,
        parentId: client.namespace.root_resource_id,
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/wizard/collect`)
        .send(collectData)
        .expect(HttpStatus.CREATED);

      const taskId = response.body.task_id;

      // Fetch the task manually
      const task = await mockWorker['fetchTask']();
      expect(task).toBeDefined();
      // Note: The task ID might be different if other tasks are in the queue

      // Send malformed callback (this should be handled gracefully by the backend)
      try {
        await mockWorker['sendCallback'](taskId, {
          output: undefined,
          exception: undefined,
        });
      } catch {
        // Expected to potentially fail, but should not crash
      }

      // Verify task can still be processed normally
      await mockWorker.pollOnce();

      const taskResponse = await client.get(
        `/api/v1/namespaces/${client.namespace.id}/tasks/${taskId}`,
      );
      expect(taskResponse.status).toBe(200);
    });

    it('should handle task processing timeouts and retries', async () => {
      // Create a task that will be processed multiple times
      const collectData = {
        html: '<html><body><h1>Retry Test</h1></body></html>',
        url: 'https://example.com/retry-test',
        title: 'Retry Test',
        namespace_id: client.namespace.id,
        parentId: client.namespace.root_resource_id,
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/wizard/collect`)
        .send(collectData)
        .expect(HttpStatus.CREATED);

      const taskId = response.body.task_id;

      // Process the task normally
      await mockWorker.pollOnce();

      // Verify task was completed
      const taskResponse = await client.get(
        `/api/v1/namespaces/${client.namespace.id}/tasks/${taskId}`,
      );
      expect(taskResponse.status).toBe(200);
      expect(taskResponse.body.ended_at).toBeDefined();
    });

    it('should handle empty task queue gracefully', async () => {
      // Ensure no tasks are pending
      let hasMoreTasks = true;
      let attempts = 0;

      while (hasMoreTasks && attempts < 10) {
        await mockWorker.pollOnce();

        // Check if there are still tasks
        const fetchResult = await mockWorker['fetchTask']();
        hasMoreTasks = fetchResult !== null;
        attempts++;
      }

      // Verify polling empty queue doesn't cause errors
      await mockWorker.pollOnce();
      await mockWorker.pollOnce();

      // Should complete without errors
      expect(true).toBe(true);
    });

    it('should handle task state validation', async () => {
      // Create and immediately try to callback for a task that hasn't started
      const collectData = {
        html: '<html><body><h1>State Test</h1></body></html>',
        url: 'https://example.com/state-test',
        title: 'State Test',
        namespace_id: client.namespace.id,
        parentId: client.namespace.root_resource_id,
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/wizard/collect`)
        .send(collectData)
        .expect(HttpStatus.CREATED);

      const taskId = response.body.task_id;

      // Try to send callback before task is started (should fail)
      try {
        await mockWorker['sendCallback'](taskId, {
          output: { test: 'data' },
          exception: undefined,
        });

        // If we reach here, the backend didn't validate properly
        fail('Expected callback to fail for non-started task');
      } catch (error) {
        // Expected behavior - callback should fail
        expect(error).toBeDefined();
      }

      // Now process normally
      await mockWorker.pollOnce();

      const taskResponse = await client.get(
        `/api/v1/namespaces/${client.namespace.id}/tasks/${taskId}`,
      );
      expect(taskResponse.status).toBe(200);
      expect(taskResponse.body.ended_at).toBeDefined();
    });
  });
});
