import { Module } from '@nestjs/common';
import { GroupMember } from './group-members.entity';
import { GroupMembersService } from './group-members.service';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  providers: [GroupMembersService],
  exports: [GroupMembersService],
  imports: [TypeOrmModule.forFeature([GroupMember])],
})
export class GroupMemberModule {}
