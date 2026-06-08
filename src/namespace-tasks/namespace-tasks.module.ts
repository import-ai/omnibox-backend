import { Module } from '@nestjs/common';
import { NamespaceTasksController } from 'omniboxd/namespace-tasks/namespace-tasks.controller';
import { NamespaceTasksService } from 'omniboxd/namespace-tasks/namespace-tasks.service';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { TasksModule } from 'omniboxd/tasks/tasks.module';

@Module({
  providers: [NamespaceTasksService],
  controllers: [NamespaceTasksController],
  imports: [TasksModule, ResourcesModule],
})
export class NamespaceTasksModule {}
