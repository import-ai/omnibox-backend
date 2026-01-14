import Dysmsapi20170525, * as $Dysmsapi20170525 from '@alicloud/dysmsapi20170525';
import * as $OpenApi from '@alicloud/openapi-client';
import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { parsePhone } from 'omniboxd/common/validators';

// Aliyun DysMS supports these regions
// CN (Mainland China), HK (Hong Kong), MO (Macau), TW (Taiwan)
const ALIYUN_SUPPORTED_COUNTRIES = ['CN', 'HK', 'MO', 'TW'];

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private client: Dysmsapi20170525 | null = null;
  private readonly signName: string;
  private readonly templateCode: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {
    const accessKeyId = this.configService.get<string>(
      'OBB_SMS_ALIYUN_ACCESS_KEY_ID',
      '',
    );
    const accessKeySecret = this.configService.get<string>(
      'OBB_SMS_ALIYUN_ACCESS_KEY_SECRET',
      '',
    );
    this.signName = this.configService.get<string>('OBB_SMS_SIGN_NAME', '');
    this.templateCode = this.configService.get<string>(
      'OBB_SMS_TEMPLATE_CODE',
      '',
    );

    if (accessKeyId && accessKeySecret) {
      const openApiConfig = new $OpenApi.Config({
        accessKeyId,
        accessKeySecret,
        endpoint: 'dysmsapi.aliyuncs.com',
      });
      this.client = new Dysmsapi20170525(openApiConfig);
    }
  }

  available() {
    return {
      available: !!(this.client && this.signName && this.templateCode),
    };
  }

  /**
   * Get the list of countries supported by the SMS provider.
   */
  getSupportedCountries(): string[] {
    if (!this.available().available) {
      return [];
    }
    return ALIYUN_SUPPORTED_COUNTRIES;
  }

  /**
   * Check if SMS can be sent to a specific country.
   */
  isCountrySupported(countryCode: string): boolean {
    return (
      this.available().available &&
      ALIYUN_SUPPORTED_COUNTRIES.includes(countryCode.toUpperCase())
    );
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    if (!this.client) {
      const message = this.i18n.t('sms.errors.serviceUnavailable');
      throw new AppException(
        message,
        'SMS_SERVICE_UNAVAILABLE',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Validate phone country is supported
    const parsed = parsePhone(phone);
    if (!parsed) {
      const message = this.i18n.t('sms.errors.invalidPhone');
      throw new AppException(
        message,
        'INVALID_PHONE_NUMBER',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!this.isCountrySupported(parsed.country)) {
      const message = this.i18n.t('sms.errors.countryNotSupported');
      throw new AppException(
        message,
        'COUNTRY_NOT_SUPPORTED',
        HttpStatus.BAD_REQUEST,
      );
    }

    const request = new $Dysmsapi20170525.SendSmsRequest({
      phoneNumbers: phone,
      signName: this.signName,
      templateCode: this.templateCode,
      templateParam: JSON.stringify({ code }),
    });

    try {
      const response = await this.client.sendSms(request);
      if (!response.body || response.body.code !== 'OK') {
        this.logger.error(
          `SMS send failed: ${response.body?.code} - ${response.body?.message}`,
        );
        const message = this.i18n.t('sms.errors.sendFailed');
        throw new AppException(
          message,
          'SMS_SEND_FAILED',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      this.logger.error('SMS send error:', error);
      const message = this.i18n.t('sms.errors.sendFailed');
      throw new AppException(
        message,
        'SMS_SEND_FAILED',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
