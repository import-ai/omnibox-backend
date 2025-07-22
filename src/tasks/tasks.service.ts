import { Repository } from 'typeorm';
import { Task } from 'omnibox-backend/tasks/tasks.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
  ) {}

  async create(data: Partial<Task>) {
    const newTask = this.taskRepository.create(data);
    return await this.taskRepository.save(newTask);
  }

  async list(namespaceId: string, offset: number, limit: number) {
    return this.taskRepository.find({
      where: { namespaceId },
      skip: offset,
      take: limit,
    });
  }

  async get(id: string) {
    const task = await this.taskRepository.findOne({
      where: { id },
    });
    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    return task;
  }

  async delete(id: string) {
    const task = await this.taskRepository.findOne({
      where: { id },
    });
    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    await this.taskRepository.softRemove(task);
  }
}
