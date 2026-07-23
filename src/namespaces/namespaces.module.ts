import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { InternalNamespacesController } from 'omniboxd/namespaces/internal.namespaces.controller';
import { NamespacePermissionsController } from 'omniboxd/namespaces/namespace-permissions.controller';
import {
  NamespacesController,
  NamespacesSingleController,
} from 'omniboxd/namespaces/namespaces.controller';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';
import { OpenAPIQuotaModule } from 'omniboxd/open-api/open-api-quota.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { TasksModule } from 'omniboxd/tasks/tasks.module';
import { UserModule } from 'omniboxd/user/user.module';

import { CurrentInfoService } from './current-info.service';
import { Namespace } from './entities/namespace.entity';
import { NamespaceMember } from './entities/namespace-member.entity';
import { NamespaceAdminInterceptor } from './interceptors/namespace-admin.interceptor';
import { NamespaceOwnerInterceptor } from './interceptors/namespace-owner.interceptor';

@Module({
  exports: [NamespacesService, CurrentInfoService],
  providers: [
    NamespacesService,
    CurrentInfoService,
    NamespaceOwnerInterceptor,
    NamespaceAdminInterceptor,
  ],
  controllers: [
    NamespacesController,
    NamespacesSingleController,
    NamespacePermissionsController,
    InternalNamespacesController,
  ],
  imports: [
    UserModule,
    NamespacesQuotaModule,
    OpenAPIQuotaModule,
    NamespaceResourcesModule,
    ResourcesModule,
    PermissionsModule,
    TasksModule,
    TypeOrmModule.forFeature([Resource]),
    TypeOrmModule.forFeature([Namespace]),
    TypeOrmModule.forFeature([NamespaceMember]),
  ],
})
export class NamespacesModule {}
