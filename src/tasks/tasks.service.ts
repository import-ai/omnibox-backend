import { Repository } from 'typeorm';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, HttpStatus } from '@nestjs/common';
import { TaskDto, TaskMetaDto } from './dto/task.dto';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
    private readonly i18n: I18nService,
  ) {}

  async create(data: Partial<Task>) {
    const newTask = this.taskRepository.create(data);
    return await this.taskRepository.save(newTask);
  }

  async list(
    namespaceId: string,
    offset: number,
    limit: number,
  ): Promise<TaskMetaDto[]> {
    const tasks = await this.taskRepository.find({
      where: { namespaceId },
      skip: offset,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return tasks.map((task) => TaskMetaDto.fromEntity(task));
  }

  async get(id: string) {
    const task = await this.taskRepository.findOne({
      where: { id },
    });
    if (!task) {
      const message = this.i18n.t('task.errors.taskNotFound', { args: { id } });
      throw new AppException(message, 'TASK_NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return task;
  }

  async delete(id: string) {
    const task = await this.taskRepository.findOne({
      where: { id },
    });
    if (!task) {
      const message = this.i18n.t('task.errors.taskNotFound', { args: { id } });
      throw new AppException(message, 'TASK_NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    await this.taskRepository.softRemove(task);
  }

  async cancelTask(id: string): Promise<TaskDto> {
    const task = await this.get(id);

    if (task.canceledAt) {
      const message = this.i18n.t('task.errors.taskAlreadyCanceled');
      throw new AppException(
        message,
        'TASK_ALREADY_CANCELED',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (task.endedAt) {
      const message = this.i18n.t('task.errors.cannotCancelFinished');
      throw new AppException(
        message,
        'CANNOT_CANCEL_FINISHED',
        HttpStatus.BAD_REQUEST,
      );
    }

    task.canceledAt = new Date();
    const updatedTask = await this.taskRepository.save(task);

    return TaskDto.fromEntity(updatedTask);
  }

  async rerunTask(id: string): Promise<TaskDto> {
    const originalTask = await this.get(id);

    if (!originalTask.canceledAt) {
      const message = this.i18n.t('task.errors.canOnlyRerunCanceled');
      throw new AppException(
        message,
        'CAN_ONLY_RERUN_CANCELED',
        HttpStatus.BAD_REQUEST,
      );
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

  async getTasksByResourceId(
    namespaceId: string,
    resourceId: string,
  ): Promise<TaskMetaDto[]> {
    const tasks = await this.taskRepository
      .createQueryBuilder('task')
      .where('task.namespaceId = :namespaceId', { namespaceId })
      .andWhere("task.payload->>'resource_id' = :resourceId", { resourceId })
      .orderBy('task.createdAt', 'DESC')
      .getMany();

    return tasks.map((task) => TaskMetaDto.fromEntity(task));
  }
}
