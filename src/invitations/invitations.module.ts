import { Module } from '@nestjs/common';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invitation } from './entities/invitation.entity';
import { AuthModule } from 'omniboxd/auth/auth.module';
import { GroupsModule } from 'omniboxd/groups/groups.module';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';

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
