import { User } from 'omnibox-backend/user/entities/user.entity';
import { Resource } from 'omnibox-backend/resources/resources.entity';
import { Repository } from 'typeorm';
import { Task } from 'omnibox-backend/tasks/tasks.entity';

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
        resource_id: resource.id,
      },
      namespaceId: resource.namespaceId,
      userId: user.id,
    });
    return await repo.save(task);
  }
}
