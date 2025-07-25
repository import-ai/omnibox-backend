import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsService } from './permissions.service';
import { Group } from 'omnibox-backend/groups/entities/group.entity';
import { PermissionsController } from './permissions.controller';
import { UserPermission } from './entities/user-permission.entity';
import { GroupPermission } from './entities/group-permission.entity';
import { Resource } from 'omnibox-backend/resources/resources.entity';
import { UserModule } from 'omnibox-backend/user/user.module';
import { GroupUser } from 'omnibox-backend/groups/entities/group-user.entity';
import { NamespaceMember } from 'omnibox-backend/namespaces/entities/namespace-member.entity';

@Module({
  providers: [PermissionsService],
  controllers: [PermissionsController],
  exports: [PermissionsService],
  imports: [
    TypeOrmModule.forFeature([
      UserPermission,
      GroupPermission,
      Resource,
      GroupUser,
      Group,
      NamespaceMember,
    ]),
    UserModule,
  ],
})
export class PermissionsModule {}
