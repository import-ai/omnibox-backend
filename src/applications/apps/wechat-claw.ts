import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { APIKeyService } from 'omniboxd/api-key/api-key.service';
import { CreateApplicationsDto } from 'omniboxd/applications/applications.dto';
import { Applications } from 'omniboxd/applications/applications.entity';
import { BaseApp } from 'omniboxd/applications/apps/base-app';
import { BotBase } from 'omniboxd/applications/apps/bot-base';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { Repository } from 'typeorm';

@Injectable()
export class WechatClaw extends BotBase {
  public static readonly appId = 'wechat_clawbot';
  private readonly OBBOT_BASE_URL: string;

  constructor(
    applicationsRepository: Repository<Applications>,
    apiKeyService: APIKeyService,
    namespacesService: NamespacesService,
    i18n: I18nService,
    private readonly configService: ConfigService,
  ) {
    super(applicationsRepository, apiKeyService, namespacesService, i18n);
    this.OBBOT_BASE_URL = this.configService.get<string>('OBBOT_BASE_URL', '');
  }

  async getAttrs(
    namespaceId: string,
    userId: string,
    createDto: CreateApplicationsDto,
  ): Promise<{ key: string } & Record<string, any>> {
    const attrs = createDto.attrs || {};
    if (!this.OBBOT_BASE_URL) {
      const message = this.i18n.t(
        'application.errors.failedToGenerateVerifyCode',
      );
      throw new AppException(
        message,
        'FAILED_TO_GENERATE_VERIFY_CODE',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      const constructor = this.constructor as typeof BaseApp;

      const response = await fetch(
        `${this.OBBOT_BASE_URL}/api/v1/${constructor.appId}/binding`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            namespace_id: namespaceId,
            user_id: userId,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as {
        key: string;
        session_key: string;
        qrcode_content: string;
      };

      return { ...attrs, ...data };
    } catch {
      const message = this.i18n.t('application.errors.bindingRequestFailed');
      throw new AppException(
        message,
        'BINDING_REQUEST_FAILED',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
