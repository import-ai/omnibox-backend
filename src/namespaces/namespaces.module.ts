import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from 'omnibox-backend/user/user.module';
import { Resource } from 'omnibox-backend/resources/resources.entity';
import { NamespacesService } from 'omnibox-backend/namespaces/namespaces.service';
import { NamespacesController } from 'omnibox-backend/namespaces/namespaces.controller';
import { Namespace } from './entities/namespace.entity';
import { NamespaceMember } from './entities/namespace-member.entity';
import { ResourcesModule } from 'omnibox-backend/resources/resources.module';
import { PermissionsModule } from 'omnibox-backend/permissions/permissions.module';

@Module({
  exports: [NamespacesService],
  providers: [NamespacesService],
  controllers: [NamespacesController],
  imports: [
    UserModule,
    ResourcesModule,
    PermissionsModule,
    TypeOrmModule.forFeature([Resource]),
    TypeOrmModule.forFeature([Namespace]),
    TypeOrmModule.forFeature([NamespaceMember]),
  ],
})
export class NamespacesModule {}
