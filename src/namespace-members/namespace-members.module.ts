import { Module } from '@nestjs/common';
import { NamespaceMemberService } from './namespace-members.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NamespaceMember } from './namespace-members.entity';

@Module({
  exports: [NamespaceMemberService],
  providers: [NamespaceMemberService],
  imports: [TypeOrmModule.forFeature([NamespaceMember])]
})
export class NamespaceMembersModule { }
