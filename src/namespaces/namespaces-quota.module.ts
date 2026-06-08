import { Module } from '@nestjs/common';

import { NamespaceReadonlyInterceptor } from './interceptors/namespace-readonly.interceptor';
import { NamespacesQuotaService } from './namespaces-quota.service';

@Module({
  providers: [NamespacesQuotaService, NamespaceReadonlyInterceptor],
  exports: [NamespacesQuotaService, NamespaceReadonlyInterceptor],
})
export class NamespacesQuotaModule {}
