import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Group } from './groups.entity';

@Module({
  providers: [GroupsService],
  exports: [GroupsService],
  controllers: [],
  imports: [TypeOrmModule.forFeature([Group])],
})
export class GroupsModule { }
