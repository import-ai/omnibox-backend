import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { context, propagation } from '@opentelemetry/api';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import type { SearchSnapshot } from 'omniboxd/search/search-session.types';
import { WizardAgentRequestDto } from 'omniboxd/wizard/dto/agent-request.dto';
import { IndexRecordDto } from 'omniboxd/wizard/dto/index-record.dto';
import { SearchRequestDto } from 'omniboxd/wizard/dto/search-request.dto';
import { SearchResponseDto } from 'omniboxd/wizard/dto/search-response.dto';
import {
  UpsertWeaviateMessageRequestDto,
  UpsertWeaviateResourceRequestDto,
  WeaviateUpsertResponseDto,
} from 'omniboxd/wizard/dto/weaviate-upsert.dto';
import {
  IWizardUrlProvider,
  WIZARD_URL_PROVIDER,
} from 'omniboxd/wizard-url-provider/wizard-url-provider.interface';

export function buildWizardRequestHeaders(
  traceHeaders: Record<string, string>,
  requestId?: string,
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(requestId ? { 'X-Request-Id': requestId } : {}),
    ...traceHeaders,
  };
}

@Injectable()
export class WizardAPIService {
  constructor(
    @Inject(WIZARD_URL_PROVIDER)
    private readonly wizardUrlProvider: IWizardUrlProvider,
    private readonly i18n: I18nService,
  ) {}

  async getModelsConfig(baseUrl?: string) {
    try {
      baseUrl ??= await this.wizardUrlProvider.getBaseUrl();
      const response = await fetch(`${baseUrl}/api/v1/wizard/models`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.status === 404) return {};
      if (!response.ok)
        throw new AppException(
          this.i18n.t('system.errors.requestFailed', {
            args: { status: response.status },
          }),
          'THINKING_CONFIG_UNAVAILABLE',
          HttpStatus.BAD_GATEWAY,
        );
      const config = await response.json();
      if (!config || typeof config !== 'object' || Array.isArray(config)) {
        throw new AppException(
          this.i18n.t('system.errors.wizardRequestFailed'),
          'INVALID_THINKING_CONFIG',
          HttpStatus.BAD_GATEWAY,
        );
      }
      // Project the public fields explicitly; never forward private Wizard config.
      const selection = (item: { edition: string; level: string }) => {
        if (
          !item ||
          !['basic', 'pro'].includes(item.edition) ||
          typeof item.level !== 'string' ||
          !/^[a-z][a-z0-9_-]*$/.test(item.level)
        ) {
          throw new AppException(
            this.i18n.t('system.errors.wizardRequestFailed'),
            'INVALID_THINKING_CONFIG',
            HttpStatus.BAD_GATEWAY,
          );
        }
        return { edition: item.edition, level: item.level };
      };
      const result: Record<
        string,
        {
          default: { edition: string; level: string };
          levels: { edition: string; level: string }[];
        }
      > = {};
      for (const edition of ['basic', 'pro', 'default']) {
        const group = config[edition];
        if (!group) continue;
        const levels = Array.isArray(group.levels)
          ? group.levels.map(selection)
          : [];
        const defaultSelection = selection(group.default);
        if (
          !levels.length ||
          !levels.some(
            (item) =>
              item.edition === defaultSelection.edition &&
              item.level === defaultSelection.level,
          ) ||
          new Set(levels.map((item) => `${item.edition}.${item.level}`))
            .size !== levels.length ||
          (edition !== 'default' &&
            levels.some((item) => item.edition !== edition))
        ) {
          throw new AppException(
            this.i18n.t('system.errors.wizardRequestFailed'),
            'INVALID_THINKING_CONFIG',
            HttpStatus.BAD_GATEWAY,
          );
        }
        result[edition] = { default: defaultSelection, levels };
      }
      if (
        result.default?.levels.some(
          (item) =>
            !result[item.edition]?.levels.some(
              (level) => level.level === item.level,
            ),
        )
      ) {
        throw new AppException(
          this.i18n.t('system.errors.wizardRequestFailed'),
          'INVALID_THINKING_CONFIG',
          HttpStatus.BAD_GATEWAY,
        );
      }
      return result;
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw new AppException(
        this.i18n.t('system.errors.wizardRequestFailed'),
        'THINKING_CONFIG_UNAVAILABLE',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  getTraceHeaders(): Record<string, string> {
    const traceHeaders: Record<string, string> = {};
    propagation.inject(context.active(), traceHeaders);
    return traceHeaders;
  }

  async createAgentStream(
    namespaceId: string,
    mode: 'ask' | 'write',
    body: WizardAgentRequestDto,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<Response> {
    const wizardBaseUrl = await this.wizardUrlProvider.getBaseUrl(
      namespaceId,
      body,
    );
    const url = `${wizardBaseUrl}/api/v1/wizard/${mode}`;
    const requestHeaders = buildWizardRequestHeaders(
      this.getTraceHeaders(),
      requestId,
    );

    const response = await fetch(url, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(body),
      signal,
    });

    return response;
  }

  async search(
    req: SearchRequestDto,
    options?: { signal?: AbortSignal },
  ): Promise<SearchResponseDto> {
    const resp = await this.request(
      'POST',
      '/internal/api/v1/wizard/search',
      instanceToPlain(req),
      {},
      options?.signal,
    );
    return plainToInstance(SearchResponseDto, resp);
  }

  async recallSearchSnapshot(
    body: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<SearchSnapshot> {
    const response = await this.request(
      'POST',
      '/internal/api/v1/wizard/search/snapshot',
      body,
      {},
      signal,
    );
    if (
      !Array.isArray(response.records) ||
      typeof response.policy_signature !== 'string' ||
      typeof response.relevance_enabled !== 'boolean' ||
      typeof response.recall_truncated !== 'boolean'
    ) {
      throw new Error('Invalid search snapshot');
    }
    return {
      records: plainToInstance(SearchResponseDto, response).records,
      policySignature: response.policy_signature,
      relevanceEnabled: response.relevance_enabled,
      recallTruncated: response.recall_truncated,
    };
  }

  async judgeSearchCandidates(
    body: {
      query: string;
      namespace_id: string;
      user_id: string;
      recall_depth: number;
      policy_signature: string;
      records: IndexRecordDto[];
      timeout_ms: number;
    },
    signal: AbortSignal,
  ): Promise<{ decisions: string[]; policy_signature: string }> {
    const response = await this.request(
      'POST',
      '/internal/api/v1/wizard/search/judge',
      {
        ...body,
        records: body.records.map((record) => ({
          type: record.type,
          namespace_id: record.namespaceId,
          user_id: record.userId,
          // Judgment needs content, scope and offsets, not the display DTO's dates.
          chunk: record.chunk && {
            title: record.chunk.title,
            resource_id: record.chunk.resourceId,
            text: record.chunk.text,
            chunk_type: record.chunk.chunkType,
            parent_id: record.chunk.parentId,
            chunk_id: record.chunk.chunkId,
            start_index: record.chunk.startIndex,
            end_index: record.chunk.endIndex,
          },
        })),
      },
      {},
      signal,
    );
    return {
      decisions: response.decisions,
      policy_signature: response.policy_signature,
    };
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

  async parseRssItem(
    params: {
      url?: string;
      content?: string;
    },
    signal?: AbortSignal,
  ): Promise<{ markdown: string }> {
    const resp = await this.request(
      'POST',
      '/internal/api/v1/wizard/rss/parse',
      { url: params.url ?? '', content: params.content ?? '' },
      {},
      signal,
    );
    return { markdown: (resp.markdown as string) ?? '' };
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
        resource_id: req.resourceId,
        parent_id: req.parentId,
        resource_tag_ids: req.resourceTagIds,
        resource_tag_names: req.resourceTagNames,
      },
      {},
    );
    return {
      success: Boolean(resp.success),
      error: resp.error as string | undefined,
    };
  }

  async clearMessageIndex(namespaceId: string): Promise<{ deleted: number }> {
    const result = await this.request(
      'POST',
      '/internal/api/v1/wizard/clear_message_index',
      { namespace_id: namespaceId },
      {},
    );
    return { deleted: Number(result.deleted) };
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
    signal?: AbortSignal,
  ): Promise<Record<string, any>> {
    const wizardBaseUrl = await this.wizardUrlProvider.getBaseUrl();
    const url = `${wizardBaseUrl}${path}`;
    const requestHeaders = {
      'Content-Type': 'application/json',
      ...headers,
      ...this.getTraceHeaders(),
    };

    // Without a signal a stalled wizard fetch never settles, so callers that pass
    // AbortSignal.timeout() are bounded; others keep the previous unbounded wait.
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: JSON.stringify(body),
      signal,
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
