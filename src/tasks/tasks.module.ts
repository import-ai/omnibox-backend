import { Module } from '@nestjs/common';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from 'omniboxd/tasks/tasks.service';
import { TasksController } from 'omniboxd/tasks/tasks.controller';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';

@Module({
  providers: [TasksService],
  imports: [NamespacesModule, TypeOrmModule.forFeature([Task])],
  controllers: [TasksController],
})
export class TasksModule {}
