import { BaseApp } from 'omniboxd/applications/apps/base-app';
import { Repository } from 'typeorm';
import { Applications } from 'omniboxd/applications/applications.entity';
import { APIKeyService } from 'omniboxd/api-key/api-key.service';
import {
  APIKeyPermissionTarget,
  APIKeyPermissionType,
} from 'omniboxd/api-key/api-key.entity';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { ApplicationsResponseDto } from 'omniboxd/applications/applications.dto';
import { APIKeyResponseDto } from 'omniboxd/api-key/api-key.dto';

export interface WechatBotCallbackRequestDto {
  verify_code: string;
  user_id: string;
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

    throw new Error(
      'Failed to generate unique verify code after maximum attempts',
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
      throw new BadRequestException('Invalid verify code');
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
      application: ApplicationsResponseDto.fromEntity(entity),
      api_key: apiKeyResponse,
    };
  }
}
