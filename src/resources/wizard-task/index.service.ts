import { User } from 'src/user/user.entity';
import { Resource } from 'src/resources/resources.entity';
import { Repository } from 'typeorm';
import { Task } from 'src/tasks/tasks.entity';

export class Index {
  static async upsert(user: User, resource: Resource, repo: Repository<Task>) {
    if (resource.resourceType === 'folder' || !resource.content) {
      return;
    }
    const task = repo.create({
      function: 'upsert_index',
      input: {
        title: resource.name,
        content: resource.content,
        meta_info: {
          user_id: resource.user.id,
          resource_id: resource.id,
          parent_id: resource.parentId,
        },
      },
      namespace: resource.namespace,
      user,
    });
    return await repo.save(task);
  }

  static async delete(user: User, resource: Resource, repo: Repository<Task>) {
    const task = repo.create({
      function: 'delete_index',
      input: {
        resource_id: resource.id,
      },
      namespace: resource.namespace,
      user,
    });
    return await repo.save(task);
  }
}
