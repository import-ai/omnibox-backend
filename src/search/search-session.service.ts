import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { trace } from '@opentelemetry/api';
import { I18nService } from 'nestjs-i18n';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import {
  comparePermission,
  ResourcePermission,
} from 'omniboxd/permissions/resource-permission.enum';
import {
  isReadOnlyResourceType,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import {
  IndexRecordDto,
  IndexRecordType,
} from 'omniboxd/wizard/dto/index-record.dto';
import { WizardAPIService } from 'omniboxd/wizard-api/wizard-api.service';

import { getArticleIdentity } from './article-dedupe.util';
import { DocType } from './doc-type.enum';
import { IndexedResourceDto } from './dto/indexed-doc.dto';
import { SearchSessionError, SearchSessionStore } from './search-session.store';
import {
  ConfirmedResource,
  SESSION_STATE_VERSION,
  SessionParams,
  SessionResourceItem,
  SessionResult,
  SessionState,
} from './search-session.types';

const REQUEST_BUDGET_MS = 10_000;
const MAX_SCANNED = 200;
const BATCH_SIZE = 32;

@Injectable()
export class SearchSessionService {
  constructor(
    private readonly store: SearchSessionStore,
    private readonly wizard: WizardAPIService,
    private readonly resources: ResourcesService,
    private readonly permissions: PermissionsService,
    private readonly config: ConfigService,
    private readonly i18n: I18nService,
  ) {}

  async run(params: SessionParams): Promise<SessionResult> {
    const span = trace.getActiveSpan();
    span?.setAttributes({
      'search.offset': params.offset,
      'search.limit': params.limit,
    });
    const deadline = Date.now() + REQUEST_BUDGET_MS;
    return await this.store.exclusive<SessionState, SessionResult>(
      params.owner,
      params.sessionId,
      async (cached, save) => {
        let state = cached;
        if (state && state.version !== SESSION_STATE_VERSION) state = null;
        span?.setAttribute('search.snapshot_cache_hit', state !== null);
        if (!state) {
          if (!params.createIfMissing)
            throw new SearchSessionError('SEARCH_SESSION_EXPIRED', 410);
          const configuredDepth = Number(
            this.config.get('OBB_SEARCH_RECALL_DEPTH', 200),
          );
          if (![200, 400].includes(configuredDepth))
            throw new SearchSessionError('SEARCH_CONFIGURATION_INVALID');
          const snapshot =
            params.resourceIds !== null && params.resourceIds.length === 0
              ? {
                  records: [],
                  recallTruncated: false,
                }
              : await this.wizard.recallSearchSnapshot(
                  {
                    query: params.query,
                    namespace_id: params.namespaceId,
                    user_id: params.userId,
                    resource_ids: params.resourceIds,
                    recall_depth: configuredDepth,
                    timeout_ms: Math.max(1, deadline - Date.now() - 250),
                  },
                  AbortSignal.timeout(Math.max(1, deadline - Date.now())),
                );
          const seen = new Set<string>();
          snapshot.records = snapshot.records.filter((r) => {
            const rid = r.chunk?.resourceId;
            if (
              r.type !== IndexRecordType.CHUNK ||
              !rid ||
              seen.has(rid) ||
              r.namespaceId !== params.namespaceId ||
              (r.userId && r.userId !== params.userId) ||
              (params.resourceIds !== null && !params.resourceIds.includes(rid))
            )
              return false;
            seen.add(rid);
            return true;
          });
          state = {
            version: SESSION_STATE_VERSION,
            fingerprint: params.fingerprint,
            query: params.query,
            depth: configuredDepth,
            snapshot,
            cursor: 0,
            confirmed: [],
            articles: [],
            requests: {},
          };
          await save(state);
        }
        span?.setAttributes({
          'search.session_id': params.sessionId,
          'search.recall_depth': state.depth,
          'search.snapshot_resource_count': state.snapshot.records.length,
          'search.recall_truncated': state.snapshot.recallTruncated,
        });
        if (state.fingerprint !== params.fingerprint)
          throw new SearchSessionError('SEARCH_SESSION_INVALIDATED', 409);
        if (state.failed)
          throw new SearchSessionError(
            state.failed,
            state.failed === 'SEARCH_SESSION_INVALIDATED' ? 409 : 503,
          );
        const replay = params.requestId
          ? state.requests[params.requestId]
          : undefined;
        if (
          replay &&
          (replay.offset !== params.offset || replay.limit !== params.limit)
        ) {
          throw new SearchSessionError('SEARCH_REQUEST_CONFLICT', 409);
        }
        try {
          if (!replay) {
            if (params.requestId && Object.keys(state.requests).length >= 128)
              throw new SearchSessionError('SEARCH_CAPACITY', 429);
            await this.advance(
              state,
              params.userId,
              params.namespaceId,
              params.offset + params.limit,
              deadline,
            );
          }
          const end =
            replay?.end ??
            Math.min(state.confirmed.length, params.offset + params.limit);
          const confirmed = state.confirmed.slice(params.offset, end);
          await this.validateConfirmed(
            confirmed,
            params.userId,
            params.namespaceId,
          );
          const items = confirmed.map((entry) =>
            this.toResourceItem(state, entry),
          );
          const status =
            replay?.status ??
            (state.cursor >= state.snapshot.records.length
              ? 'complete'
              : 'partial');
          const hasMore =
            replay?.hasMore ??
            (state.cursor < state.snapshot.records.length ||
              end < state.confirmed.length);
          const total = replay
            ? replay.total
            : status === 'complete'
              ? state.confirmed.length
              : null;
          if (params.requestId)
            state.requests[params.requestId] = {
              offset: params.offset,
              limit: params.limit,
              end,
              total,
              status,
              hasMore,
            };
          span?.setAttributes({
            'search.resource_candidate_cursor': state.cursor,
            'search.confirmed_count': state.confirmed.length,
            'search.has_more': hasMore,
            'search.session_status': status,
            'search.idempotent_replay': !!replay,
          });
          return {
            items,
            total,
            confirmedCount: state.confirmed.length,
            nextOffset: Math.max(params.offset, end),
            hasMore,
            status,
            recallTruncated: state.snapshot.recallTruncated,
          };
        } catch (error) {
          if (
            error instanceof SearchSessionError &&
            error.code === 'SEARCH_SESSION_INVALIDATED'
          )
            state.failed = error.code;
          throw error;
        } finally {
          await save(state);
        }
      },
    );
  }

  private async advance(
    state: SessionState,
    userId: string,
    namespaceId: string,
    wanted: number,
    deadline: number,
  ) {
    let scanned = 0;
    while (
      state.confirmed.length < wanted &&
      state.cursor < state.snapshot.records.length &&
      scanned < MAX_SCANNED &&
      Date.now() < deadline
    ) {
      const start = state.cursor;
      const end = Math.min(
        start + BATCH_SIZE,
        state.snapshot.records.length,
        start + MAX_SCANNED - scanned,
      );
      const records = state.snapshot.records.slice(start, end);
      const visible = await this.visibleItems(records, userId, namespaceId);
      for (let index = start; index < end; index++) {
        const record = state.snapshot.records[index];
        const item = visible.get(record.chunk!.resourceId);
        if (!item) continue;
        const identity = getArticleIdentity(item);
        if (identity !== null) {
          if (state.articles.includes(identity)) continue;
          state.articles.push(identity);
        }
        state.confirmed.push({ index, item });
      }
      state.cursor = end;
      scanned += end - start;
    }
  }

  private async visibleItems(
    records: IndexRecordDto[],
    userId: string,
    namespaceId: string,
  ): Promise<Map<string, SessionResourceItem>> {
    const ids = records.flatMap((r) => (r.chunk ? [r.chunk.resourceId] : []));
    if (!ids.length) return new Map();
    const metadata = await this.resources.batchGetParentResources(
      namespaceId,
      ids,
    );
    const permissions = await this.permissions.getCurrentPermissions(
      userId,
      namespaceId,
      [...metadata.values()],
    );
    const items = new Map<string, SessionResourceItem>();
    for (const record of records) {
      const chunk = record.chunk!;
      const resource = metadata.get(chunk.resourceId);
      const permission = permissions.get(chunk.resourceId);
      if (
        !resource ||
        !permission ||
        comparePermission(permission, ResourcePermission.CAN_VIEW) < 0
      )
        continue;
      items.set(chunk.resourceId, {
        type: DocType.RESOURCE,
        id: record.id || chunk.chunkId,
        resourceId: chunk.resourceId,
        title: chunk.title || this.i18n.t('system.untitled'),
        attrs: resource.attrs || {},
        resourceType: resource.resourceType || ResourceType.DOC,
        readOnly: isReadOnlyResourceType(
          resource.resourceType || ResourceType.DOC,
        ),
      });
    }
    return items;
  }

  private toResourceItem(
    state: SessionState,
    { index, item }: ConfirmedResource,
  ): IndexedResourceDto {
    return {
      ...item,
      content: state.snapshot.records[index]?.chunk?.text || '',
    };
  }

  private async validateConfirmed(
    items: ConfirmedResource[],
    userId: string,
    namespaceId: string,
  ) {
    if (!items.length) return;
    const resourceIds = items.map((entry) => entry.item.resourceId);
    const metadata = await this.resources.batchGetParentResources(
      namespaceId,
      resourceIds,
    );
    const permissions = await this.permissions.getCurrentPermissions(
      userId,
      namespaceId,
      [...metadata.values()],
    );
    if (
      resourceIds.some(
        (resourceId) =>
          !metadata.has(resourceId) ||
          !permissions.get(resourceId) ||
          comparePermission(
            permissions.get(resourceId)!,
            ResourcePermission.CAN_VIEW,
          ) < 0,
      )
    ) {
      throw new SearchSessionError('SEARCH_SESSION_INVALIDATED', 409);
    }
  }
}
