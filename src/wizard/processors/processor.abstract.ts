import { Task } from 'omniboxd/tasks/tasks.entity';
import { Transaction } from 'omniboxd/utils/transaction-utils';

export abstract class Processor {
  abstract process(task: Task, tx?: Transaction): Promise<Record<string, any>>;
}
