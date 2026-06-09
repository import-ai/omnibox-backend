import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'omniboxd/auth/auth.module';
import { GroupsModule } from 'omniboxd/groups/groups.module';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';

import { Invitation } from './entities/invitation.entity';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({
  exports: [],
  controllers: [InvitationsController],
  providers: [InvitationsService],
  imports: [
    TypeOrmModule.forFeature([Invitation]),
    AuthModule,
    GroupsModule,
    NamespacesModule,
  ],
})
export class InvitationsModule {}
