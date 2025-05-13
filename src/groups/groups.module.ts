import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Group } from './entities/group.entity';
import { GroupUser } from './entities/group-user.entity';

@Module({
  providers: [GroupsService],
  exports: [GroupsService],
  controllers: [],
  imports: [
    TypeOrmModule.forFeature([Group]),
    TypeOrmModule.forFeature([GroupUser]),
  ],
})
export class GroupsModule {}
