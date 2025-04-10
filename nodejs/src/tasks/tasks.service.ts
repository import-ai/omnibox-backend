import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './tasks.entity';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
  ) {}

  async createTask(data: Partial<Task>): Promise<Task> {
    const task = this.taskRepository.create(data);
    return this.taskRepository.save(task);
  }

  async listTasks(namespaceId: string, offset: number, limit: number): Promise<Task[]> {
    return this.taskRepository.find({
      where: { namespaceId },
      skip: offset,
      take: limit,
    });
  }

  async getTaskById(taskId: string): Promise<Task> {
    const task = await this.taskRepository.findOne({ where: { taskId } });
    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }
    return task;
  }

  async deleteTask(taskId: string): Promise<void> {
    const task = await this.taskRepository.findOne({ where: { taskId } });
    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }
    await this.taskRepository.softRemove(task);
  }
}
