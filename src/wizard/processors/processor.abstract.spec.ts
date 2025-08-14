/* eslint-disable @typescript-eslint/unbound-method */
import { Processor } from './processor.abstract';
import { Task } from 'omniboxd/tasks/tasks.entity';

// Concrete implementation for testing the abstract class
class TestProcessor extends Processor {
  process(task: Task): Promise<Record<string, any>> {
    return Promise.resolve({ processed: true, taskId: task.id });
  }
}

describe('Processor (Abstract)', () => {
  let processor: TestProcessor;

  beforeEach(() => {
    processor = new TestProcessor();
  });

  describe('abstract interface', () => {
    it('should define the process method signature', () => {
      expect(processor.process).toBeDefined();
      expect(typeof processor.process).toBe('function');
    });

    it('should require process method to return Promise<Record<string, any>>', async () => {
      const mockTask = {
        id: 'test-task-id',
        namespaceId: 'test-namespace',
        userId: 'test-user',
        function: 'test',
        input: {},
        payload: null,
        output: null,
        exception: null,
        priority: 5,
        startedAt: null,
        endedAt: null,
        canceledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      } as Task;

      const result = await processor.process(mockTask);

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect(result.processed).toBe(true);
      expect(result.taskId).toBe('test-task-id');
    });

    it('should be instantiable through concrete implementation', () => {
      expect(processor).toBeInstanceOf(TestProcessor);
      expect(processor).toBeInstanceOf(Processor);
    });
  });

  describe('inheritance behavior', () => {
    it('should allow concrete implementations to override process method', async () => {
      class CustomProcessor extends Processor {
        process(task: Task): Promise<Record<string, any>> {
          return Promise.resolve({ custom: true, function: task.function });
        }
      }

      const customProcessor = new CustomProcessor();
      const mockTask = {
        id: 'custom-task',
        function: 'custom-function',
        namespaceId: 'test-namespace',
        userId: 'test-user',
        input: {},
        payload: null,
        output: null,
        exception: null,
        priority: 5,
        startedAt: null,
        endedAt: null,
        canceledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      } as Task;

      const result = await customProcessor.process(mockTask);

      expect(result.custom).toBe(true);
      expect(result.function).toBe('custom-function');
    });
  });
});
