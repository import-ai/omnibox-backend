import { Module } from '@nestjs/common';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';
import { OpenAPIQuotaService } from 'omniboxd/open-api/open-api-quota.service';

@Module({
  imports: [NamespacesQuotaModule],
  providers: [OpenAPIQuotaService],
  exports: [OpenAPIQuotaService],
})
export class OpenAPIQuotaModule {}
