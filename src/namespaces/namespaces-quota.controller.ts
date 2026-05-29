import { Controller, Get, Param } from '@nestjs/common';
import { NamespaceUsageDto } from 'omniboxd/namespaces/dto/namespace-usage.dto';
import { NamespacesQuotaService } from 'omniboxd/namespaces/namespaces-quota.service';

@Controller('api/v1/namespaces/:namespaceId/quota')
export class NamespacesQuotaController {
  constructor(
    private readonly namespacesQuotaService: NamespacesQuotaService,
  ) {}

  @Get()
  async getNamespaceUsage(
    @Param('namespaceId') namespaceId: string,
  ): Promise<NamespaceUsageDto> {
    return await this.namespacesQuotaService.getNamespaceUsage(namespaceId);
  }
}
