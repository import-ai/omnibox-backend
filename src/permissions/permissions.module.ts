import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Group } from 'omniboxd/groups/entities/group.entity';
import { GroupUser } from 'omniboxd/groups/entities/group-user.entity';
import { NamespaceMember } from 'omniboxd/namespaces/entities/namespace-member.entity';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { UserModule } from 'omniboxd/user/user.module';

import { GroupPermission } from './entities/group-permission.entity';
import { UserPermission } from './entities/user-permission.entity';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';

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
    ResourcesModule,
  ],
})
export class PermissionsModule {}
