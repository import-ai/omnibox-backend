import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { NamespaceUsageDto } from './dto/namespace-usage.dto';
import { AppException } from 'omniboxd/common/exceptions/app.exception';

const DEFAULT_USAGE: NamespaceUsageDto = {
  storageQuota: 0,
  storageUsage: 0,
  taskPriority: 1,
  taskParallelism: 1,
  fileUploadSizeLimit: 20 * 1024 * 1024, // 20MB
  trashRetentionDays: 7,
};

@Injectable()
export class NamespacesQuotaService {
  private readonly proUrl: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.proUrl = this.configService.get<string>('OBB_PRO_URL');
  }

  async getNamespaceUsage(namespaceId: string): Promise<NamespaceUsageDto> {
    if (!this.proUrl) {
      return DEFAULT_USAGE;
    }
    const response = await fetch(
      `${this.proUrl}/internal/api/v1/namespaces/${namespaceId}/usages`,
    );
    if (!response.ok) {
      throw new AppException(
        `Failed to get usage for namespace ${namespaceId}`,
        'INTERNAL_SERVER_ERROR',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    const data = await response.json();
    return plainToInstance(NamespaceUsageDto, data);
  }

  async isNamespaceReadonly(namespaceId: string): Promise<boolean> {
    const usage = await this.getNamespaceUsage(namespaceId);
    return usage.storageQuota > 0 && usage.storageUsage > usage.storageQuota;
  }
}
