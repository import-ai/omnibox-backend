import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { AppException } from 'omniboxd/common/exceptions/app.exception';

import { NamespaceUsageDto } from './dto/namespace-usage.dto';

const DEFAULT_USAGE: NamespaceUsageDto = {
  storageQuota: 0,
  storageUsage: 0,
  taskPriority: 1,
  taskParallelism: 1,
  fileUploadSizeLimit: 20 * 1024 * 1024, // 20MB
  trashRetentionDays: 7,
  openApiRequestsPer24h: 0,
  readonly: false,
  smartFolderPrivateLimit: 1,
  smartFolderTeamLimit: 1,
  smartFolderRuleLimit: 3,
};

@Injectable()
export class NamespacesQuotaService {
  private readonly proUrl: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.proUrl = this.configService.get<string>('OBB_PRO_URL');
  }

  async getNamespaceUsage(namespaceId: string): Promise<NamespaceUsageDto> {
    if (!this.proUrl) {
      return { ...DEFAULT_USAGE };
    }
    let response: Response;
    try {
      response = await fetch(
        `${this.proUrl}/internal/api/v1/namespaces/${namespaceId}/usages`,
      );
    } catch {
      return { ...DEFAULT_USAGE };
    }
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

  async batchGetNamespaceParallelism(
    namespaceIds: string[],
  ): Promise<Record<string, number>> {
    if (!this.proUrl) {
      return Object.fromEntries(
        namespaceIds.map((id) => [id, DEFAULT_USAGE.taskParallelism]),
      );
    }
    const params = new URLSearchParams({
      namespace_ids: namespaceIds.join(','),
    });
    let response: Response;
    try {
      response = await fetch(
        `${this.proUrl}/internal/api/v1/pro-namespaces?${params}`,
      );
    } catch {
      return Object.fromEntries(
        namespaceIds.map((id) => [id, DEFAULT_USAGE.taskParallelism]),
      );
    }
    if (!response.ok) {
      throw new AppException(
        'Failed to get namespace info',
        'INTERNAL_SERVER_ERROR',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    const {
      namespaces,
    }: {
      namespaces: { namespace_id: string; max_parallelism: number }[];
    } = await response.json();
    const parallelismById = new Map(
      namespaces.map((n) => [n.namespace_id, n.max_parallelism]),
    );
    return Object.fromEntries(
      namespaceIds.map((id) => [
        id,
        parallelismById.get(id) ?? DEFAULT_USAGE.taskParallelism,
      ]),
    );
  }

  async isNamespaceReadonly(namespaceId: string): Promise<boolean> {
    const usage = await this.getNamespaceUsage(namespaceId);
    return usage.readonly;
  }
}
