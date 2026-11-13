import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { trace } from '@opentelemetry/api';
import { createHash, randomUUID } from 'crypto';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
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
  SessionPage,
  SessionPagination,
  SessionParams,
  SessionResourceItem,
  SessionResult,
  SessionState,
} from './search-session.types';

const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const REQUEST_BUDGET_MS = 10_000;
const JUDGE_BUDGET_MS = 3000;
const MAX_SCANNED = 200;
const MAX_ATTEMPTS = 3;
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

  async paginate(
    userId: string,
    namespaceId: string,
    query: string,
    resourceIds: string[] | null,
    page: SessionPagination,
  ): Promise<SessionPage> {
    const version2 = page.paginationVersion === 2;
    const span = trace.getActiveSpan();
    span?.setAttribute('search.pagination_version', version2 ? 2 : 1);
    const fingerprint = digest([
      userId,
      namespaceId,
      query,
      resourceIds === null ? null : [...resourceIds].sort(),
    ]);
    const owner = digest([userId, namespaceId]);
    if (version2 && !page.requestId) this.fail('SEARCH_REQUEST_REQUIRED', 400);
    const requestId = version2 ? page.requestId! : randomUUID();
    const id = version2
      ? page.searchId || digest([owner, requestId])
      : 'v1-' + fingerprint;
    try {
      const result = await this.run({
        owner,
        fingerprint,
        sessionId: id,
        createIfMissing: !(version2 && page.searchId),
        requestId,
        userId,
        namespaceId,
        query,
        resourceIds,
        offset: page.offset,
        limit: page.limit,
      });
      if (!version2 && !result.items.length && result.hasMore)
        throw new SearchSessionError('SEARCH_PENDING');
      return {
        items: result.items,
        offset: page.offset,
        limit: page.limit,
        searchId: id,
        nextOffset: result.nextOffset,
        hasMore: result.hasMore,
        total: version2
          ? result.total
          : (result.total ??
            Math.max(
              result.confirmedCount,
              page.offset + result.items.length + 1,
            )),
        status: result.status,
        recallTruncated: result.recallTruncated,
      };
    } catch (error) {
      if (error instanceof AppException) throw error;
      if (error instanceof SearchSessionError)
        this.fail(error.code, error.status);
      this.fail('SEARCH_UNAVAILABLE');
    }
  }

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
                  relevanceEnabled: false,
                  policySignature: 'empty',
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
            decisions: {},
            attempts: {},
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
              save,
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
            ['SEARCH_SESSION_INVALIDATED', 'SEARCH_JUDGMENT_FAILED'].includes(
              error.code,
            )
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
    persist: (value: SessionState) => Promise<void>,
  ) {
    let scanned = 0;
    const attempted = new Set<number>();
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
      const indexes = Array.from({ length: end - start }, (_, i) => start + i);
      const unresolved = indexes.filter(
        (i) => !state.decisions[i] || state.decisions[i].status === 'pending',
      );
      if (unresolved.some((i) => attempted.has(i))) break;
      const records = unresolved.map((i) => state.snapshot.records[i]);
      const visible = await this.visibleItems(records, userId, namespaceId);
      const judgeIndexes: number[] = [];
      for (let n = 0; n < unresolved.length; n++) {
        const i = unresolved[n],
          record = records[n];
        const item = visible.get(record.chunk!.resourceId);
        if (!item) state.decisions[i] = { status: 'rejected' };
        else if (!state.snapshot.relevanceEnabled)
          state.decisions[i] = { status: 'kept', item };
        else judgeIndexes.push(i);
      }
      if (judgeIndexes.length) {
        if (Date.now() >= deadline) break;
        for (const i of judgeIndexes) {
          if ((state.attempts[i] || 0) >= MAX_ATTEMPTS)
            throw new SearchSessionError('SEARCH_JUDGMENT_FAILED');
          state.attempts[i] = (state.attempts[i] || 0) + 1;
          attempted.add(i);
        }
        await persist(state);
        let decisions: string[];
        try {
          const result = await this.wizard.judgeSearchCandidates(
            {
              query: state.query,
              namespace_id: namespaceId,
              user_id: userId,
              recall_depth: state.depth,
              policy_signature: state.snapshot.policySignature,
              records: judgeIndexes.map((i) => state.snapshot.records[i]),
              timeout_ms: Math.max(
                1,
                Math.min(JUDGE_BUDGET_MS, deadline - Date.now()),
              ),
            },
            AbortSignal.timeout(Math.max(1, deadline - Date.now())),
          );
          if (result.policy_signature !== state.snapshot.policySignature)
            throw new SearchSessionError('SEARCH_SESSION_INVALIDATED', 409);
          if (
            result.decisions.length !== judgeIndexes.length ||
            result.decisions.some(
              (d) => !['kept', 'rejected', 'pending'].includes(d),
            )
          )
            throw new Error('Invalid decisions');
          decisions = result.decisions;
        } catch (error) {
          if (error instanceof SearchSessionError) throw error;
          decisions = judgeIndexes.map(() => 'pending');
        }
        judgeIndexes.forEach((i, n) => {
          state.decisions[i] = {
            status: decisions[n] as 'kept' | 'rejected' | 'pending',
            item: visible.get(state.snapshot.records[i].chunk!.resourceId),
          };
        });
      }
      while (state.cursor < end) {
        const decision = state.decisions[state.cursor];
        if (!decision || decision.status === 'pending') break;
        if (decision.status === 'kept' && decision.item) {
          const identity = getArticleIdentity(decision.item);
          if (identity === null || !state.articles.includes(identity)) {
            if (identity !== null) state.articles.push(identity);
            state.confirmed.push({ index: state.cursor, item: decision.item });
          }
        }
        delete state.decisions[state.cursor];
        delete state.attempts[state.cursor];
        state.cursor++;
      }
      scanned += end - start;
      if (state.cursor === start) {
        if (
          judgeIndexes.some(
            (i) =>
              state.decisions[i]?.status === 'pending' &&
              state.attempts[i] >= MAX_ATTEMPTS,
          )
        )
          throw new SearchSessionError('SEARCH_JUDGMENT_FAILED');
        break;
      }
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

  private fail(code: string, status = 503): never {
    throw new AppException(
      this.i18n.t('system.errors.requestFailed', { args: { status } }),
      code,
      status as HttpStatus,
    );
  }
}
