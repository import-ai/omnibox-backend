import { Injectable, HttpStatus } from '@nestjs/common';
import { BaseApp } from 'omniboxd/applications/apps/base-app';
import { CreateApplicationsDto } from 'omniboxd/applications/applications.dto';
import { ConfigService } from '@nestjs/config';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';

export interface WechatClawBindingResponse {
  sessionKey: string;
  liteappUrl: string;
}

export interface WechatClawAttrs {
  session_key: string;
  liteapp_url: string;
  account_id?: string;
  binding_complete?: boolean;
}

@Injectable()
export class WechatClaw extends BaseApp {
  public static readonly appId = 'wechat_clawbot';

  constructor(
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {
    super();
  }

  async getAttrs(
    namespaceId: string,
    userId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    createDto: CreateApplicationsDto,
  ): Promise<WechatClawAttrs> {
    // Call SDK to initiate binding
    const sdkUrl = this.configService.get<string>('OBB_WECHAT_CLAW_SDK_URL');
    if (!sdkUrl) {
      const message = this.i18n.t('application.errors.sdkNotConfigured');
      throw new AppException(
        message,
        'SDK_NOT_CONFIGURED',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      const response = await fetch(`${sdkUrl}/api/v1/binding`, {
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

      const data = (await response.json()) as WechatClawBindingResponse;

      return {
        session_key: data.sessionKey,
        liteapp_url: data.liteappUrl,
        binding_complete: false,
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

  // eslint-disable-next-line @typescript-eslint/require-await
  async callback(data: Record<string, any>): Promise<Record<string, any>> {
    // Handle binding completion callback from bot
    const { session_key, account_id } = data;

    if (!session_key || !account_id) {
      const message = this.i18n.t('application.errors.invalidCallbackData');
      throw new AppException(
        message,
        'INVALID_CALLBACK_DATA',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Return success - actual DB update is handled by the internal controller
    return {
      success: true,
      session_key,
      account_id,
    };
  }
}
