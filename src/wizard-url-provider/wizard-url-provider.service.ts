import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { IWizardUrlProvider } from 'omniboxd/wizard-url-provider/wizard-url-provider.interface';

@Injectable()
export class WizardUrlProviderService implements IWizardUrlProvider {
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {
    const baseUrl = this.configService.get<string>('OBB_WIZARD_BASE_URL');
    if (!baseUrl) {
      const message = this.i18n.t('system.errors.missingWizardBaseUrl');
      throw new AppException(
        message,
        'MISSING_WIZARD_BASE_URL',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    this.baseUrl = baseUrl;
  }

  getBaseUrl(): Promise<string> {
    return Promise.resolve(this.baseUrl);
  }
}
