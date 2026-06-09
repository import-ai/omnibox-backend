import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invitation } from 'omniboxd/invitations/entities/invitation.entity';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { UserModule } from 'omniboxd/user/user.module';

import { Group } from './entities/group.entity';
import { GroupUser } from './entities/group-user.entity';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({
  providers: [GroupsService],
  exports: [GroupsService],
  controllers: [GroupsController],
  imports: [
    TypeOrmModule.forFeature([Group]),
    TypeOrmModule.forFeature([GroupUser]),
    TypeOrmModule.forFeature([Invitation]),
    NamespacesModule,
    UserModule,
  ],
})
export class GroupsModule {}
