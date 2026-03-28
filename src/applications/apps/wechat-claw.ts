import { HttpStatus, Injectable } from '@nestjs/common';
import { CreateApplicationsDto } from 'omniboxd/applications/applications.dto';
import { ConfigService } from '@nestjs/config';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { Applications } from 'omniboxd/applications/applications.entity';
import { Repository } from 'typeorm';
import { APIKeyService } from 'omniboxd/api-key/api-key.service';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { BotBase } from 'omniboxd/applications/apps/bot-base';

@Injectable()
export class WechatClaw extends BotBase {
  public static readonly appId = 'wechat_clawbot';
  private readonly OBB_BOT_BASE_URL: string;

  constructor(
    private readonly configService: ConfigService,
    applicationsRepository: Repository<Applications>,
    apiKeyService: APIKeyService,
    namespacesService: NamespacesService,
    i18n: I18nService,
  ) {
    super(applicationsRepository, apiKeyService, namespacesService, i18n);
    this.OBB_BOT_BASE_URL = this.configService.get<string>(
      'OBB_BOT_BASE_URL',
      '',
    );
  }

  async getAttrs(
    namespaceId: string,
    userId: string,
    createDto: CreateApplicationsDto,
  ): Promise<{ key: string } & Record<string, any>> {
    const attrs = createDto.attrs || {};
    if (!this.OBB_BOT_BASE_URL) {
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
      const response = await fetch(`${this.OBB_BOT_BASE_URL}/api/v1/binding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          namespaceId,
          userId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as {
        session_key: string;
        qrcode_url: string;
      };

      return {
        ...attrs,
        key: data.session_key,
        session_key: data.session_key,
        qrcode_url: data.qrcode_url,
      };
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
