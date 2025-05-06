import { Task } from 'src/tasks/tasks.entity';

export abstract class Processor {
  abstract process(task: Task): Promise<Record<string, any>>;
}
