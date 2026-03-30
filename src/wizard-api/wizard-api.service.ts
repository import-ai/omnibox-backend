import { instanceToPlain, plainToInstance } from 'class-transformer';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { propagation, context } from '@opentelemetry/api';
import { SearchRequestDto } from 'omniboxd/wizard/dto/search-request.dto';
import { SearchResponseDto } from 'omniboxd/wizard/dto/search-response.dto';
import {
  UpsertWeaviateMessageRequestDto,
  UpsertWeaviateResourceRequestDto,
  WeaviateUpsertResponseDto,
} from 'omniboxd/wizard/dto/weaviate-upsert.dto';
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
    namespaceId: string,
    mode: 'ask' | 'write',
    body: Record<string, any>,
    requestId: string,
  ): Promise<Response> {
    const wizardBaseUrl = await this.wizardUrlProvider.getBaseUrl(namespaceId);
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

  async search(req: SearchRequestDto): Promise<SearchResponseDto> {
    const resp = await this.request(
      'POST',
      '/internal/api/v1/wizard/search',
      instanceToPlain(req),
      {},
    );
    return plainToInstance(SearchResponseDto, resp);
  }

  async createTitle(
    namespaceId: string,
    body: {
      text: string;
      lang: string;
    },
  ): Promise<{ title: string }> {
    const resp = await this.request(
      'POST',
      '/internal/api/v1/wizard/title',
      body,
      {},
    );
    return { title: resp.title as string };
  }

  async upsertWeaviateResource(
    req: UpsertWeaviateResourceRequestDto,
  ): Promise<WeaviateUpsertResponseDto> {
    const resp = await this.request(
      'POST',
      '/internal/api/v1/wizard/upsert_weaviate/resource',
      {
        namespace_id: req.namespaceId,
        title: req.title,
        content: req.content,
        meta_info: {
          resource_id: req.metaInfo.resourceId,
          parent_id: req.metaInfo.parentId,
          resource_tags: req.metaInfo.resourceTags,
        },
      },
      {},
    );
    return {
      success: Boolean(resp.success),
      error: resp.error as string | undefined,
    };
  }

  async upsertWeaviateMessage(
    req: UpsertWeaviateMessageRequestDto,
  ): Promise<WeaviateUpsertResponseDto> {
    const resp = await this.request(
      'POST',
      '/internal/api/v1/wizard/upsert_weaviate/message',
      {
        namespace_id: req.namespaceId,
        user_id: req.userId,
        message: {
          conversation_id: req.message.conversationId,
          message_id: req.message.messageId,
          message: {
            role: req.message.message.role,
            content: req.message.message.content,
          },
        },
      },
      {},
    );
    return {
      success: Boolean(resp.success),
      error: resp.error as string | undefined,
    };
  }

  private async request(
    method: string,
    path: string,
    body: Record<string, any>,
    headers: Record<string, string>,
  ): Promise<Record<string, any>> {
    const wizardBaseUrl = await this.wizardUrlProvider.getBaseUrl();
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
