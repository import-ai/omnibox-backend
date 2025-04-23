import { Repository, Like } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { Task } from 'src/tasks/tasks.entity';
import { Resource } from 'src/resources/resources.entity';

@Injectable()
export class WizardService {
  constructor(
    @InjectRepository(Task) private taskRepository: Repository<Task>,
  ) {}

  async index(resource: Resource) {
    if (!(resource.resourceType !== "folder" && resource.content)) {
      return;
    }
    await this.taskRepository.create({
      function: "create_or_update_index",
      input: {
        title: resource.name,
        content: resource.content,
        meta_info: {
          user_id: resource.user.id,
          space_type: resource.spaceType,
          resource_id: resource.id,
          parent_id: resource.parentId,
        },
      },
      namespace: resource.namespace,
      user: resource.user,
    });
  }

  async deleteIndex(resource: Resource) {
    await this.taskRepository.create({
      function: "delete_index",
      input: {
        resource_id: resource.id,
      },
      namespace: resource.namespace,
      user: resource.user,
    });
  }
}