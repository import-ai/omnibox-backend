import { Repository } from 'typeorm';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { InjectRepository } from '@nestjs/typeorm';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TaskDto } from './dto/task.dto';

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

  async list(
    namespaceId: string,
    offset: number,
    limit: number,
  ): Promise<TaskDto[]> {
    const tasks = await this.taskRepository.find({
      where: { namespaceId },
      skip: offset,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return tasks.map((task) => TaskDto.fromEntity(task));
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

  async cancelTask(id: string): Promise<TaskDto> {
    const task = await this.get(id);

    if (task.canceledAt) {
      throw new BadRequestException('Task is already canceled');
    }
    if (task.endedAt) {
      throw new BadRequestException('Cannot cancel a finished task');
    }

    task.canceledAt = new Date();
    const updatedTask = await this.taskRepository.save(task);

    return TaskDto.fromEntity(updatedTask);
  }

  async rerunTask(id: string): Promise<TaskDto> {
    const originalTask = await this.get(id);

    if (!originalTask.canceledAt) {
      throw new BadRequestException('Can only rerun canceled tasks');
    }

    const newTask = await this.create({
      namespaceId: originalTask.namespaceId,
      userId: originalTask.userId,
      priority: originalTask.priority,
      function: originalTask.function,
      input: originalTask.input,
      payload: originalTask.payload,
    });

    return TaskDto.fromEntity(newTask);
  }
}
