import { User } from 'src/user/entities/user.entity';
import { Resource } from 'src/resources/resources.entity';
import { Repository } from 'typeorm';
import { Task } from 'src/tasks/tasks.entity';

export class Reader {
  static async upsert(user: User, resource: Resource, repo: Repository<Task>) {
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
        resourceId: resource.id,
      },
      namespace: { id: resource.namespaceId },
      user,
    });
    return await repo.save(task);
  }
}
