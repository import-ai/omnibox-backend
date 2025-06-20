import { Module } from '@nestjs/common';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invitation } from './entities/invitation.entity';

@Module({
  exports: [],
  controllers: [InvitationsController],
  providers: [InvitationsService],
  imports: [TypeOrmModule.forFeature([Invitation])],
})
export class InvitationsModule {}
