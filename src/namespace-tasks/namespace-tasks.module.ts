import { Module } from '@nestjs/common';
import { NamespaceTasksController } from 'omniboxd/namespace-tasks/namespace-tasks.controller';
import { NamespaceTasksService } from 'omniboxd/namespace-tasks/namespace-tasks.service';
import { TasksModule } from 'omniboxd/tasks/tasks.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';

@Module({
  providers: [NamespaceTasksService],
  controllers: [NamespaceTasksController],
  imports: [TasksModule, ResourcesModule],
})
export class NamespaceTasksModule {}
