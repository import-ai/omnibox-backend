import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from 'omniboxd/user/user.module';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { NamespacesController } from 'omniboxd/namespaces/namespaces.controller';
import { NamespaceMember } from './entities/namespace-member.entity';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { Namespace } from './entities/namespace.entity';
import { NamespaceOwnerInterceptor } from './interceptors/namespace-owner.interceptor';
import { NamespaceAdminInterceptor } from './interceptors/namespace-admin.interceptor';

@Module({
  exports: [NamespacesService],
  providers: [
    NamespacesService,
    NamespaceOwnerInterceptor,
    NamespaceAdminInterceptor,
  ],
  controllers: [NamespacesController],
  imports: [
    UserModule,
    NamespaceResourcesModule,
    ResourcesModule,
    PermissionsModule,
    TypeOrmModule.forFeature([Resource]),
    TypeOrmModule.forFeature([Namespace]),
    TypeOrmModule.forFeature([NamespaceMember]),
  ],
})
export class NamespacesModule {}
