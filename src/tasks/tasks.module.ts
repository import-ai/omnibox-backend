import { Module } from '@nestjs/common';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from 'omniboxd/tasks/tasks.service';
import { UserModule } from 'omniboxd/user/user.module';
import {
  ResourceTasksController,
  TasksController,
} from 'omniboxd/tasks/tasks.controller';
import { WizardTaskService } from 'omniboxd/tasks/wizard-task.service';
import { InternalWizardTasksController } from 'omniboxd/tasks/internal.wizard-tasks.controller';
import { KafkaModule } from 'omniboxd/kafka/kafka.module';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';

@Module({
  providers: [TasksService, WizardTaskService],
  imports: [
    TypeOrmModule.forFeature([Task]),
    UserModule,
    KafkaModule,
    NamespacesQuotaModule,
  ],
  controllers: [
    TasksController,
    ResourceTasksController,
    InternalWizardTasksController,
  ],
  exports: [TasksService, WizardTaskService],
})
export class TasksModule {}
