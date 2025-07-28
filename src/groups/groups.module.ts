import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Group } from './entities/group.entity';
import { GroupUser } from './entities/group-user.entity';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { GroupsController } from './groups.controller';
import { Invitation } from 'omniboxd/invitations/entities/invitation.entity';
import { UserModule } from 'omniboxd/user/user.module';

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
