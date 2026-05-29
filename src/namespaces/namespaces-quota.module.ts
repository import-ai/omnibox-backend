import { Module } from '@nestjs/common';
import { NamespacesQuotaController } from './namespaces-quota.controller';
import { NamespacesQuotaService } from './namespaces-quota.service';
import { NamespaceReadonlyInterceptor } from './interceptors/namespace-readonly.interceptor';

@Module({
  controllers: [NamespacesQuotaController],
  providers: [NamespacesQuotaService, NamespaceReadonlyInterceptor],
  exports: [NamespacesQuotaService, NamespaceReadonlyInterceptor],
})
export class NamespacesQuotaModule {}
