import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsService } from './permissions.service';
import { Group } from 'omniboxd/groups/entities/group.entity';
import { PermissionsController } from './permissions.controller';
import { UserPermission } from './entities/user-permission.entity';
import { GroupPermission } from './entities/group-permission.entity';
import { Resource } from 'omniboxd/namespace-resources/namespace-resources.entity';
import { UserModule } from 'omniboxd/user/user.module';
import { GroupUser } from 'omniboxd/groups/entities/group-user.entity';
import { NamespaceMember } from 'omniboxd/namespaces/entities/namespace-member.entity';

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
