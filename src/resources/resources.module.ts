import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from 'src/resources/resources.entity';
import { ResourcesService } from 'src/resources/resources.service';
import { ResourcesController } from 'src/resources/resources.controller';
import { Task } from 'src/tasks/tasks.entity';
import { NamespaceMembersModule } from 'src/namespace-members/namespace-members.module';

@Module({
  exports: [ResourcesService],
  providers: [ResourcesService],
  controllers: [ResourcesController],
  imports: [
    TypeOrmModule.forFeature([Resource]),
    TypeOrmModule.forFeature([Task]),
    NamespaceMembersModule,
  ],
})
export class ResourcesModule { }
