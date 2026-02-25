import { instanceToPlain, plainToInstance } from 'class-transformer';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { propagation, context } from '@opentelemetry/api';
import { SearchRequestDto } from 'omniboxd/wizard/dto/search-request.dto';
import { SearchResponseDto } from 'omniboxd/wizard/dto/search-response.dto';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class WizardAPIService {
  private readonly wizardBaseUrl: string;

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
    this.wizardBaseUrl = baseUrl;
  }

  getTraceHeaders(): Record<string, string> {
    const traceHeaders: Record<string, string> = {};
    propagation.inject(context.active(), traceHeaders);
    return traceHeaders;
  }

  async requestStream(
    url: string,
    body: Record<string, any>,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    const requestHeaders = {
      'Content-Type': 'application/json',
      ...headers,
      ...this.getTraceHeaders(),
    };

    const response = await fetch(`${this.wizardBaseUrl}${url}`, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(body),
    });

    return response;
  }

  async request(
    method: string,
    url: string,
    body: Record<string, any>,
    headers: Record<string, string> = {},
  ): Promise<Record<string, any>> {
    const requestHeaders = {
      'Content-Type': 'application/json',
      ...headers,
      ...this.getTraceHeaders(),
    };

    const response = await fetch(`${this.wizardBaseUrl}${url}`, {
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

  async proxy(req: Request): Promise<Record<string, any>> {
    const url = `${this.wizardBaseUrl}${req.url}`;
    const response = await fetch(url, {
      method: req.method,
      headers: {
        ...this.getTraceHeaders(),
        ...req.headers,
      },
      body: JSON.stringify(req.body),
    });
    return response.json();
  }

  async search(req: SearchRequestDto): Promise<SearchResponseDto> {
    const resp = await this.request(
      'POST',
      '/internal/api/v1/wizard/search',
      instanceToPlain(req),
      {},
    );
    return plainToInstance(SearchResponseDto, resp);
  }
}
