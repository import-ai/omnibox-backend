import { BaseApp } from 'omniboxd/applications/apps/base-app';
import { Repository } from 'typeorm';
import { Applications } from 'omniboxd/applications/applications.entity';
import { APIKeyService } from 'omniboxd/api-key/api-key.service';
import {
  APIKeyPermissionTarget,
  APIKeyPermissionType,
} from 'omniboxd/api-key/api-key.entity';
import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { ApplicationsResponseDto } from 'omniboxd/applications/applications.dto';
import { APIKeyResponseDto } from 'omniboxd/api-key/api-key.dto';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';

export interface WechatBotCallbackRequestDto {
  verify_code: string;
  wechat_user_id: string;
  nickname: string;
}

export interface WechatBotCallbackResponseDto {
  application: ApplicationsResponseDto;
  api_key: APIKeyResponseDto;
}

@Injectable()
export class WechatBot extends BaseApp {
  public static readonly appId = 'wechat_bot';

  constructor(
    @InjectRepository(Applications)
    private readonly applicationsRepository: Repository<Applications>,
    private readonly apiKeyService: APIKeyService,
    private readonly namespacesService: NamespacesService,
    private readonly i18n: I18nService,
  ) {
    super();
  }

  async getEntityByVerifyCode(code: string): Promise<Applications | null> {
    return await this.applicationsRepository
      .createQueryBuilder()
      .where('app_id = :appId', { appId: WechatBot.appId })
      .andWhere("attrs->>'verify_code' = :code", { code })
      .getOne();
  }

  private async generateUniqueVerifyCode(): Promise<string> {
    let verifyCode = '';
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
      const existingAuth = await this.getEntityByVerifyCode(verifyCode);

      if (!existingAuth) {
        return verifyCode;
      }

      attempts++;
    }

    const message = this.i18n.t(
      'application.errors.failedToGenerateVerifyCode',
    );
    throw new AppException(
      message,
      'FAILED_TO_GENERATE_VERIFY_CODE',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  async getAttrs(
    _namespaceId: string,
    _userId: string,
    createDto: any,
  ): Promise<{ verify_code: string } & Record<string, any>> {
    const attrs = createDto.attrs || {};
    return {
      ...attrs,
      verify_code: await this.generateUniqueVerifyCode(),
    };
  }

  async callback(
    data: WechatBotCallbackRequestDto,
  ): Promise<WechatBotCallbackResponseDto> {
    const entity = await this.getEntityByVerifyCode(data.verify_code);

    if (!entity) {
      const message = this.i18n.t('application.errors.invalidVerifyCode');
      throw new AppException(
        message,
        'INVALID_VERIFY_CODE',
        HttpStatus.BAD_REQUEST,
      );
    }

    entity.attrs = {
      ...entity.attrs,
      wechat_user_id: data.wechat_user_id,
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
          {
            target: APIKeyPermissionTarget.CHAT,
            permissions: [APIKeyPermissionType.CREATE],
          },
        ],
      },
    });

    entity.apiKeyId = apiKeyResponse.id;

    // Remove verify_code from attrs after successful API key creation
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { verify_code, ...attrsWithoutVerifyCode } = entity.attrs;
    entity.attrs = attrsWithoutVerifyCode;

    await this.applicationsRepository.save(entity);

    return {
      application: ApplicationsResponseDto.fromEntity(entity),
      api_key: apiKeyResponse,
    };
  }

  async postDelete(application: Applications): Promise<void> {
    if (application.apiKeyId) {
      await this.apiKeyService.delete(application.apiKeyId);
    }
  }
}
