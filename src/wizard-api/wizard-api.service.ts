import { instanceToPlain, plainToInstance } from 'class-transformer';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { propagation, context } from '@opentelemetry/api';
import { SearchRequestDto } from 'omniboxd/wizard/dto/search-request.dto';
import { SearchResponseDto } from 'omniboxd/wizard/dto/search-response.dto';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import {
  IWizardUrlProvider,
  WIZARD_URL_PROVIDER,
} from 'omniboxd/wizard-url-provider/wizard-url-provider.interface';

@Injectable()
export class WizardAPIService {
  constructor(
    @Inject(WIZARD_URL_PROVIDER)
    private readonly wizardUrlProvider: IWizardUrlProvider,
    private readonly i18n: I18nService,
  ) {}

  getTraceHeaders(): Record<string, string> {
    const traceHeaders: Record<string, string> = {};
    propagation.inject(context.active(), traceHeaders);
    return traceHeaders;
  }

  async createAgentStream(
    userId: string | null,
    mode: 'ask' | 'write',
    body: Record<string, any>,
    requestId: string,
  ): Promise<Response> {
    const wizardBaseUrl = await this.wizardUrlProvider.getBaseUrl(userId);
    const url = `${wizardBaseUrl}/api/v1/wizard/${mode}`;
    const requestHeaders = {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
      ...this.getTraceHeaders(),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(body),
    });

    return response;
  }

  async search(
    userId: string | null,
    req: SearchRequestDto,
  ): Promise<SearchResponseDto> {
    const resp = await this.request(
      userId,
      'POST',
      '/internal/api/v1/wizard/search',
      instanceToPlain(req),
      {},
    );
    return plainToInstance(SearchResponseDto, resp);
  }

  async createTitle(
    userId: string | null,
    body: {
      text: string;
      lang: string;
    },
  ): Promise<{ title: string }> {
    const resp = await this.request(
      userId,
      'POST',
      '/internal/api/v1/wizard/title',
      body,
      {},
    );
    return { title: resp.title as string };
  }

  private async request(
    userId: string | null,
    method: string,
    path: string,
    body: Record<string, any>,
    headers: Record<string, string>,
  ): Promise<Record<string, any>> {
    const wizardBaseUrl = await this.wizardUrlProvider.getBaseUrl(userId);
    const url = `${wizardBaseUrl}${path}`;
    const requestHeaders = {
      'Content-Type': 'application/json',
      ...headers,
      ...this.getTraceHeaders(),
    };

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const message = this.i18n.t('system.errors.requestFailed', {
        args: { status: response.status },
      });
      throw new AppException(
        message,
        'REQUEST_FAILED',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return await response.json();
  }
}
