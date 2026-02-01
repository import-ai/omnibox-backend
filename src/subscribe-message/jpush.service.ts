import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { JpushNotificationDto } from './dto/jpush-notification.dto';

interface JpushResponse {
  sendno?: string;
  msg_id?: string;
  error?: {
    code: number;
    message: string;
  };
}

@Injectable()
export class JpushService {
  private readonly logger = new Logger(JpushService.name);

  private readonly appKey: string;
  private readonly masterSecret: string;
  private readonly authHeader: string;
  private readonly apnsProduction: boolean;
  private readonly pushUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {
    this.appKey = this.configService.get<string>('OBB_JPUSH_APP_KEY', '');
    this.masterSecret = this.configService.get<string>(
      'OBB_JPUSH_MASTER_SECRET',
      '',
    );
    this.authHeader = Buffer.from(
      `${this.appKey}:${this.masterSecret}`,
    ).toString('base64');
    this.apnsProduction =
      this.configService.get<string>('OBB_APNS_PRODUCTION', 'false') === 'true';
    this.pushUrl = this.configService.get<string>(
      'OBB_JPUSH_URL',
      'https://api.jpush.cn/v3/push',
    );
  }

  async sendNotification(dto: JpushNotificationDto): Promise<JpushResponse> {
    // JPush alias only supports letters, numbers, underscores
    const alias = dto.userId.replace(/-/g, '_');

    const payload = {
      platform: 'all',
      audience: {
        alias: [alias],
      },
      notification: {
        android: {
          alert: dto.content,
          title: dto.title,
          extras: dto.extras || {},
        },
        ios: {
          alert: {
            title: dto.title,
            body: dto.content,
          },
          sound: 'default',
          extras: dto.extras || {},
        },
      },
      options: {
        apns_production: this.apnsProduction,
      },
    };

    const response = await fetch(this.pushUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${this.authHeader}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result: JpushResponse = await response.json();

    if (result.error) {
      this.logger.error({
        message: 'JPush send notification error',
        error: result.error,
      });
      throw new AppException(
        this.i18n.t('system.errors.jpushSendFailed', {
          args: { message: result.error.message },
        }),
        result.error.code.toString(),
        HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }

  async sendToAll(
    title: string,
    content: string,
    extras?: Record<string, any>,
  ): Promise<JpushResponse> {
    const payload = {
      platform: 'all',
      audience: 'all',
      notification: {
        android: {
          alert: content,
          title: title,
          extras: extras || {},
        },
        ios: {
          alert: {
            title: title,
            body: content,
          },
          sound: 'default',
          extras: extras || {},
        },
      },
      options: {
        apns_production: this.apnsProduction,
      },
    };

    const response = await fetch(this.pushUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${this.authHeader}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result: JpushResponse = await response.json();

    if (result.error) {
      throw new AppException(
        this.i18n.t('system.errors.jpushBroadcastFailed', {
          args: { message: result.error.message },
        }),
        result.error.code.toString(),
        HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }
}
