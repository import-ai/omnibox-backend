import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsService } from './permissions.service';
import { PermissionsController } from './permissions.controller';
import { UserPermission } from './entities/user-permission.entity';
import { GroupPermission } from './entities/group-permission.entity';
import { Resource } from 'src/resources/resources.entity';
import { UserModule } from 'src/user/user.module';
import { GroupsModule } from 'src/groups/groups.module';

@Module({
  providers: [PermissionsService],
  controllers: [PermissionsController],
  exports: [PermissionsService],
  imports: [
    TypeOrmModule.forFeature([UserPermission, GroupPermission, Resource]),
    UserModule,
    GroupsModule,
  ],
})
export class PermissionsModule {}
