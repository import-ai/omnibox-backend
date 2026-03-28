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
import {
  ApplicationsResponseDto,
  CreateApplicationsDto,
} from 'omniboxd/applications/applications.dto';
import { APIKeyResponseDto } from 'omniboxd/api-key/api-key.dto';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';

export interface BotCallbackRequestDto {
  key: string;
}

export interface BotCallbackResponseDto {
  application: ApplicationsResponseDto;
  api_key: APIKeyResponseDto;
}

@Injectable()
export abstract class BotBase extends BaseApp {
  constructor(
    @InjectRepository(Applications)
    protected readonly applicationsRepository: Repository<Applications>,
    protected readonly apiKeyService: APIKeyService,
    protected readonly namespacesService: NamespacesService,
    protected readonly i18n: I18nService,
  ) {
    super();
  }

  async getApplicationByKey(key: string): Promise<Applications | null> {
    const constructor = this.constructor as typeof BaseApp;

    return await this.applicationsRepository
      .createQueryBuilder()
      .where('app_id = :appId', { appId: constructor.appId })
      .andWhere("attrs->>'key' = :key", { key })
      .getOne();
  }

  async generateUniqueKey(): Promise<string> {
    let key = '';
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      key = Math.floor(100000 + Math.random() * 900000).toString();
      const existingAuth = await this.getApplicationByKey(key);

      if (!existingAuth) {
        return key;
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
    namespaceId: string,
    userId: string,
    createDto: CreateApplicationsDto,
  ): Promise<{ key: string } & Record<string, any>> {
    const attrs = createDto.attrs || {};
    return {
      ...attrs,
      key: await this.generateUniqueKey(),
    };
  }

  async callback(data: BotCallbackRequestDto): Promise<BotCallbackResponseDto> {
    const { key, ...rest } = data;

    const entity = await this.getApplicationByKey(key);

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
      ...rest,
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

    // Remove key from attrs after successful API key creation
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { key: _, ...attrsWithoutVerifyCode } = entity.attrs;
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
