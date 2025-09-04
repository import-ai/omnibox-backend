import { BaseApp } from 'omniboxd/applications/apps/base-app';
import { Repository } from 'typeorm';
import { Applications } from 'omniboxd/applications/applications.entity';
import { APIKeyService } from 'omniboxd/api-key/api-key.service';
import {
  APIKeyPermissionTarget,
  APIKeyPermissionType,
} from 'omniboxd/api-key/api-key.entity';
import { Injectable } from '@nestjs/common';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { ApplicationsResponseDto } from 'omniboxd/applications/applications.dto';

export interface WechatBotCallbackDto {
  code: string;
  user_id: string;
  nickname: string;
}

@Injectable()
export class WechatBot extends BaseApp {
  public static readonly appId = 'wechat_bot';

  constructor(
    private readonly applicationsRepository: Repository<Applications>,
    private readonly apiKeyService: APIKeyService,
    private readonly namespacesService: NamespacesService,
  ) {
    super();
  }

  private async generateUniqueVerifyCode(): Promise<string> {
    let verifyCode = '';
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      verifyCode = Math.floor(100000 + Math.random() * 900000).toString();

      const existingAuth = await this.applicationsRepository
        .createQueryBuilder('apps')
        .where('apps.app_id = :appId', { appId: WechatBot.appId })
        .andWhere("apps.attrs->>'verify_code' = :verifyCode", { verifyCode })
        .getOne();

      if (!existingAuth) {
        return verifyCode;
      }

      attempts++;
    }

    throw new Error(
      'Failed to generate unique verify code after maximum attempts',
    );
  }

  async getAttrs(
    _namespaceId: string,
    _userId: string,
    createDto: any,
  ): Promise<Record<string, any>> {
    const attrs = createDto.attrs || {};
    return {
      ...attrs,
      verify_code: await this.generateUniqueVerifyCode(),
    };
  }

  async callback(data: WechatBotCallbackDto): Promise<Record<string, any>> {
    const entity = await this.applicationsRepository
      .createQueryBuilder('apps')
      .where('apps.app_id = :appId', { appId: WechatBot.appId })
      .andWhere("apps.attrs->>'verify_code' = :code", { code: data.code })
      .getOne();

    if (!entity) {
      return { status: 'error', message: 'Invalid verification code' };
    }

    entity.attrs = {
      ...entity.attrs,
      user_id: data.user_id,
      nickname: data.nickname,
    };

    const private_root_resource_id: string =
      await this.namespacesService.getPrivateRootId(
        entity.userId,
        entity.namespaceId,
      );

    const apiKeyResponse = await this.apiKeyService.create({
      user_id: entity.userId,
      namespace_id: entity.namespaceId,
      attrs: {
        related_app_id: entity.appId,
        root_resource_id: private_root_resource_id,
        permissions: [
          {
            target: APIKeyPermissionTarget.RESOURCES,
            permissions: [
              APIKeyPermissionType.CREATE,
              APIKeyPermissionType.READ,
            ],
          },
        ],
      },
    });

    entity.apiKeyId = apiKeyResponse.id;

    await this.applicationsRepository.save(entity);

    return {
      status: 'success',
      application: ApplicationsResponseDto.fromEntity(entity),
      api_key: apiKeyResponse.value,
    };
  }
}
