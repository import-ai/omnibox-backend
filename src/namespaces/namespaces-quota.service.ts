import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NamespacesQuotaService {
  private readonly logger = new Logger(NamespacesQuotaService.name);
  private readonly proUrl: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.proUrl = this.configService.get<string>('OBB_PRO_URL');
  }

  async isNamespaceReadonly(namespaceId: string): Promise<boolean> {
    if (!this.proUrl) {
      return false;
    }

    try {
      const response = await fetch(
        `${this.proUrl}/internal/api/v1/namespaces/${namespaceId}/quotas/storage-check`,
      );

      if (!response.ok) {
        this.logger.warn(
          `Failed to check storage quota for namespace ${namespaceId}: ${response.status}`,
        );
        return false;
      }

      const data = await response.json();
      return data.readonly === true;
    } catch (error) {
      this.logger.error(
        `Error checking storage quota for namespace ${namespaceId}`,
        error,
      );
      return false;
    }
  }
}
