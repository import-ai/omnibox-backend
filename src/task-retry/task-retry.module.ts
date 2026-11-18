import { Module } from '@nestjs/common';
import { FilesModule } from 'omniboxd/files/files.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { TaskRerunController } from 'omniboxd/task-retry/task-retry.controller';
import { TaskRetryService } from 'omniboxd/task-retry/task-retry.service';
import { TasksModule } from 'omniboxd/tasks/tasks.module';

// Lives outside TasksModule because preparing a retry needs the permission and
// resource lookups, and those modules already import TasksModule: placing it
// there would close a module cycle.
@Module({
  imports: [TasksModule, PermissionsModule, ResourcesModule, FilesModule],
  providers: [TaskRetryService],
  controllers: [TaskRerunController],
  exports: [TaskRetryService],
})
export class TaskRetryModule {}
