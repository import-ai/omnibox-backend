import { Resource } from 'omniboxd/resources/resources.entity';
import { Repository } from 'typeorm';
import { Task } from 'omniboxd/tasks/tasks.entity';

export class Reader {
  static async upsert(
    userId: string,
    resource: Resource,
    repo: Repository<Task>,
  ) {
    const task = repo.create({
      function: 'file_reader',
      input: {
        title: resource.name,
        original_name: resource.attrs.original_name,
        filename: resource.attrs.filename,
        mimetype: resource.attrs.mimetype,
        resource_id: resource.id,
      },
      payload: {
        resource_id: resource.id,
      },
      namespaceId: resource.namespaceId,
      userId,
    });
    return await repo.save(task);
  }
}
