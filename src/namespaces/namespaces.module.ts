import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from 'omniboxd/user/user.module';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { NamespacesController } from 'omniboxd/namespaces/namespaces.controller';
import { Namespace } from './entities/namespace.entity';
import { NamespaceMember } from './entities/namespace-member.entity';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';

@Module({
  exports: [NamespacesService],
  providers: [NamespacesService],
  controllers: [NamespacesController],
  imports: [
    UserModule,
    NamespaceResourcesModule,
    PermissionsModule,
    TypeOrmModule.forFeature([Resource]),
    TypeOrmModule.forFeature([Namespace]),
    TypeOrmModule.forFeature([NamespaceMember]),
  ],
})
export class NamespacesModule {}
