import { HttpStatus, Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { OpenAPIQuotaService } from 'omniboxd/open-api/open-api-quota.service';
import { UserResponseDto } from 'omniboxd/user/dto/user-response.dto';
import { UserService } from 'omniboxd/user/user.service';

import {
  CurrentInfoResponseDto,
  CurrentNamespaceResponseDto,
} from './dto/current-info-response.dto';
import { NamespacesService } from './namespaces.service';
import { NamespacesQuotaService } from './namespaces-quota.service';

@Injectable()
export class CurrentInfoService {
  constructor(
    private readonly namespacesService: NamespacesService,
    private readonly namespacesQuotaService: NamespacesQuotaService,
    private readonly openAPIQuotaService: OpenAPIQuotaService,
    private readonly userService: UserService,
    private readonly i18n: I18nService,
  ) {}

  async getCurrentInfo(
    userId: string,
    namespaceId: string,
  ): Promise<CurrentInfoResponseDto> {
    const member = await this.namespacesService.getMemberByUserId(
      namespaceId,
      userId,
    );
    if (!member) {
      throw new AppException(
        this.i18n.t('namespace.errors.notAMember'),
        'NOT_A_MEMBER',
        HttpStatus.FORBIDDEN,
      );
    }

    const [user, namespace, namespaceUsage, namespaceTier] = await Promise.all([
      this.userService.find(userId),
      this.namespacesService.getNamespace(namespaceId),
      this.namespacesQuotaService.getNamespaceUsage(namespaceId),
      this.namespacesQuotaService.getNamespaceTier(namespaceId),
    ]);

    const openApiRequestsQuota = await this.openAPIQuotaService.getQuotaStatus(
      namespaceId,
      namespaceUsage,
    );

    return Object.assign(new CurrentInfoResponseDto(), {
      user: UserResponseDto.fromEntity(user),
      namespace: CurrentNamespaceResponseDto.fromNamespace(
        namespace,
        namespaceTier,
      ),
      namespaceUsage,
      openApiRequestsQuota,
    });
  }
}
