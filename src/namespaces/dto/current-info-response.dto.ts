import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { Namespace } from 'omniboxd/namespaces/entities/namespace.entity';
import { OpenAPIRequestsQuotaDto } from 'omniboxd/open-api/open-api-quota.dto';
import { UserResponseDto } from 'omniboxd/user/dto/user-response.dto';

import { NamespaceResponseDto } from './namespace-response.dto';
import { NamespaceTier } from './namespace-tier.enum';
import { NamespaceUsageDto } from './namespace-usage.dto';

export class CurrentNamespaceResponseDto extends NamespaceResponseDto {
  @ApiProperty({ enum: NamespaceTier })
  @Expose()
  tier: NamespaceTier;

  static fromNamespace(
    namespace: Namespace,
    tier: NamespaceTier,
  ): CurrentNamespaceResponseDto {
    return Object.assign(
      new CurrentNamespaceResponseDto(),
      NamespaceResponseDto.fromEntity(namespace),
      { tier },
    );
  }
}

export class CurrentInfoResponseDto {
  @ApiProperty({ type: () => UserResponseDto })
  @Type(() => UserResponseDto)
  user: UserResponseDto;

  @ApiProperty({ type: () => CurrentNamespaceResponseDto })
  @Type(() => CurrentNamespaceResponseDto)
  namespace: CurrentNamespaceResponseDto;

  @ApiProperty({ type: () => NamespaceUsageDto })
  @Expose({ name: 'namespace_usage' })
  @Type(() => NamespaceUsageDto)
  namespaceUsage: NamespaceUsageDto;

  @ApiProperty({ type: () => OpenAPIRequestsQuotaDto })
  @Expose({ name: 'open_api_requests_quota' })
  @Type(() => OpenAPIRequestsQuotaDto)
  openApiRequestsQuota: OpenAPIRequestsQuotaDto;
}
