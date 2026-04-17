import { Module } from '@nestjs/common';
import { NamespacesQuotaService } from './namespaces-quota.service';
import { NamespaceReadonlyInterceptor } from './interceptors/namespace-readonly.interceptor';

@Module({
  providers: [NamespacesQuotaService, NamespaceReadonlyInterceptor],
  exports: [NamespacesQuotaService, NamespaceReadonlyInterceptor],
})
export class NamespacesQuotaModule {}
