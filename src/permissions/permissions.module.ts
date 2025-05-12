import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsService } from './permissions.service';
import { PermissionsController } from './permissions.controller';
import { UserPermission } from './entities/user-permission.entity';
import { GroupPermission } from './entities/group-permission.entity';
import { ResourcesModule } from 'src/resources/resources.module';

@Module({
  providers: [PermissionsService],
  controllers: [PermissionsController],
  exports: [PermissionsService],
  imports: [
    TypeOrmModule.forFeature([UserPermission, GroupPermission]),
    ResourcesModule,
  ],
})
export class PermissionsModule {}
