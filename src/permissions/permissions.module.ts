import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsService } from './permissions.service';
import { PermissionsController } from './permissions.controller';
import { UserPermission } from './entities/user-permission.entity';
import { GroupPermission } from './entities/group-permission.entity';
import { Resource } from 'src/resources/resources.entity';
import { UserModule } from 'src/user/user.module';
import { GroupUser } from 'src/groups/entities/group-user.entity';
import { NamespaceMember } from 'src/namespaces/entities/namespace-member.entity';

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
      NamespaceMember,
    ]),
    UserModule,
  ],
})
export class PermissionsModule {}
