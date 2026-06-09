import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KafkaModule } from 'omniboxd/kafka/kafka.module';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';
import { S3Module } from 'omniboxd/s3/s3.module';
import { TagModule } from 'omniboxd/tag/tag.module';
import { InternalWizardTasksController } from 'omniboxd/tasks/internal.wizard-tasks.controller';
import {
  ResourceTasksController,
  TasksController,
} from 'omniboxd/tasks/tasks.controller';
import { TasksCronService } from 'omniboxd/tasks/tasks.cron.service';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { TasksService } from 'omniboxd/tasks/tasks.service';
import { WizardCapabilitiesService } from 'omniboxd/tasks/wizard-capabilities.service';
import { WizardTaskService } from 'omniboxd/tasks/wizard-task.service';
import { UserModule } from 'omniboxd/user/user.module';

@Module({
  providers: [
    TasksService,
    WizardTaskService,
    WizardCapabilitiesService,
    TasksCronService,
  ],
  imports: [
    TypeOrmModule.forFeature([Task]),
    UserModule,
    KafkaModule,
    NamespacesQuotaModule,
    TagModule,
    S3Module,
  ],
  controllers: [
    TasksController,
    ResourceTasksController,
    InternalWizardTasksController,
  ],
  exports: [TasksService, WizardTaskService],
})
export class TasksModule {}
