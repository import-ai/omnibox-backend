import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { trace } from '@opentelemetry/api';
import { plainToInstance } from 'class-transformer';
import { AppException } from 'omniboxd/common/exceptions/app.exception';

import { NamespaceTier } from './dto/namespace-tier.enum';
import { NamespaceUsageDto } from './dto/namespace-usage.dto';

interface ProNamespaceInfo {
  namespace_id: string;
  tier: NamespaceTier;
  max_parallelism: number;
}

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
    const namespaces = await this.batchGetNamespaceInfos(namespaceIds);
    const parallelismById = new Map(
      namespaces.map((namespace) => [
        namespace.namespace_id,
        namespace.max_parallelism,
      ]),
    );
    return Object.fromEntries(
      namespaceIds.map((id) => [
        id,
        parallelismById.get(id) ?? DEFAULT_USAGE.taskParallelism,
      ]),
    );
  }

  async getNamespaceTier(namespaceId: string): Promise<NamespaceTier> {
    if (!this.proUrl) {
      return NamespaceTier.BASIC;
    }
    const namespaces = await this.batchGetNamespaceInfos([namespaceId]);
    return namespaces[0].tier;
  }

  private async batchGetNamespaceInfos(
    namespaceIds: string[],
  ): Promise<ProNamespaceInfo[]> {
    if (!this.proUrl || namespaceIds.length === 0) {
      return [];
    }
    const params = new URLSearchParams({
      namespace_ids: namespaceIds.join(','),
    });
    try {
      const response = await fetch(
        `${this.proUrl}/internal/api/v1/pro-namespaces?${params}`,
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          message?: string;
          code?: string;
        };
        throw new AppException(
          data.message ?? `Pro API error: ${response.statusText}`,
          data.code ?? 'PRO_NAMESPACE_INFO_FAILED',
          response.status as HttpStatus,
        );
      }
      const data = (await response.json()) as {
        namespaces: ProNamespaceInfo[];
      };
      return data.namespaces;
    } catch (error) {
      if (error instanceof Error) {
        trace.getActiveSpan()?.recordException(error);
      }
      throw error;
    }
  }

  async isNamespaceReadonly(namespaceId: string): Promise<boolean> {
    const usage = await this.getNamespaceUsage(namespaceId);
    return usage.readonly;
  }
}
