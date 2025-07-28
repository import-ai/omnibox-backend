import { Task } from 'omniboxd/tasks/tasks.entity';

export abstract class Processor {
  abstract process(task: Task): Promise<Record<string, any>>;
}
