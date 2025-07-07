import { Module } from '@nestjs/common';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invitation } from './entities/invitation.entity';
import { AuthModule } from 'src/auth/auth.module';
import { GroupsModule } from 'src/groups/groups.module';

@Module({
  exports: [],
  controllers: [InvitationsController],
  providers: [InvitationsService],
  imports: [TypeOrmModule.forFeature([Invitation]), AuthModule, GroupsModule],
})
export class InvitationsModule {}
