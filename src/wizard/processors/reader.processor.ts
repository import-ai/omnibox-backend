import { CollectProcessor } from 'omnibox-backend/wizard/processors/collect.processor';
import { Task } from 'omnibox-backend/tasks/tasks.entity';

export class ReaderProcessor extends CollectProcessor {
  async process(task: Task): Promise<Record<string, any>> {
    if (task.output?.markdown) {
      return await super.process(task);
    } else {
      return {};
    }
  }
}
