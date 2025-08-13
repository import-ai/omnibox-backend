import { Resource } from 'omniboxd/resources/resources.entity';
import { Repository } from 'typeorm';
import { Task } from 'omniboxd/tasks/tasks.entity';

export class TagExtract {
  static async upsert(
    userId: string,
    resource: Resource,
    repo: Repository<Task>,
    priority: number = 5,
  ) {
    const task = repo.create({
      function: 'tag_extract',
      input: {
        content: resource.content,
        title: resource.name,
        resource_type: resource.resourceType,
      },
      payload: {
        resource_id: resource.id,
      },
      namespaceId: resource.namespaceId,
      userId,
      priority,
    });
    return await repo.save(task);
  }
}
