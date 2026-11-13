import { HttpStatus } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { createHash } from 'crypto';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';

import { IndexedResourceDto } from './dto/indexed-doc.dto';
import type { SearchPaginatedResult } from './search.service';
import { SearchSessionError } from './search-session.store';
import {
  SessionPage,
  SessionParams,
  SessionResult,
} from './search-session.types';

export interface SessionRunner {
  run(params: SessionParams): Promise<SessionResult>;
}

export interface V1PageRequest {
  userId: string;
  namespaceId: string;
  query: string;
  resourceIds: string[] | null;
  offset: number;
  limit: number;
}

export interface V2PageRequest extends V1PageRequest {
  searchId?: string;
  requestId?: string;
}

export interface SearchPageRequest extends V1PageRequest {
  paginationVersion?: number;
  searchId?: string;
  requestId?: string;
}

const digest = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Both the owner and fingerprint digests are part of the durable session
// identity; they must stay byte-for-byte stable across rolling deploys.
export function sessionOwner(userId: string, namespaceId: string): string {
  return digest([userId, namespaceId]);
}

export function sessionFingerprint(
  userId: string,
  namespaceId: string,
  query: string,
  resourceIds: string[] | null,
): string {
  return digest([
    userId,
    namespaceId,
    query,
    resourceIds === null ? null : [...resourceIds].sort(),
  ]);
}

function raiseSessionError(i18n: I18nService, error: unknown): never {
  if (error instanceof AppException) throw error;
  if (error instanceof SearchSessionError)
    throw new AppException(
      i18n.t('system.errors.requestFailed', { args: { status: error.status } }),
      error.code,
      error.status as HttpStatus,
    );
  throw new AppException(
    i18n.t('system.errors.requestFailed', {
      args: { status: HttpStatus.SERVICE_UNAVAILABLE },
    }),
    'SEARCH_UNAVAILABLE',
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}

export async function paginateSearch(
  engine: SessionRunner,
  i18n: I18nService,
  request: SearchPageRequest,
): Promise<SearchPaginatedResult> {
  return request.paginationVersion === 2
    ? paginateV2(engine, i18n, request)
    : paginateV1(engine, i18n, request);
}

export async function paginateV1(
  engine: SessionRunner,
  i18n: I18nService,
  request: V1PageRequest,
): Promise<{
  items: IndexedResourceDto[];
  total: number;
  offset: number;
  limit: number;
}> {
  const { userId, namespaceId, query, resourceIds, offset, limit } = request;
  trace.getActiveSpan()?.setAttribute('search.pagination_version', 1);
  try {
    // A filter with no candidates must not create (and LRU-evict) a session.
    if (resourceIds !== null && resourceIds.length === 0)
      return { items: [], total: 0, offset, limit };
    const fingerprint = sessionFingerprint(
      userId,
      namespaceId,
      query,
      resourceIds,
    );
    const result = await engine.run({
      owner: sessionOwner(userId, namespaceId),
      fingerprint,
      sessionId: 'v1-' + fingerprint,
      createIfMissing: true,
      userId,
      namespaceId,
      query,
      resourceIds,
      offset,
      limit,
    });
    if (!result.items.length && result.hasMore)
      throw new SearchSessionError('SEARCH_PENDING');
    return {
      items: result.items,
      total:
        result.total ??
        Math.max(result.confirmedCount, offset + result.items.length + 1),
      offset,
      limit,
    };
  } catch (error) {
    raiseSessionError(i18n, error);
  }
}

export async function paginateV2(
  engine: SessionRunner,
  i18n: I18nService,
  request: V2PageRequest,
): Promise<SessionPage> {
  const { userId, namespaceId, query, resourceIds, offset, limit } = request;
  trace.getActiveSpan()?.setAttribute('search.pagination_version', 2);
  try {
    if (!request.requestId)
      throw new SearchSessionError('SEARCH_REQUEST_REQUIRED', 400);
    const owner = sessionOwner(userId, namespaceId);
    const explicit = request.searchId || undefined;
    const sessionId = explicit ?? digest([owner, request.requestId]);
    const result = await engine.run({
      owner,
      fingerprint: sessionFingerprint(userId, namespaceId, query, resourceIds),
      sessionId,
      createIfMissing: !explicit,
      requestId: request.requestId,
      userId,
      namespaceId,
      query,
      resourceIds,
      offset,
      limit,
    });
    return {
      items: result.items,
      offset,
      limit,
      searchId: sessionId,
      nextOffset: result.nextOffset,
      hasMore: result.hasMore,
      total: result.total,
      status: result.status,
      recallTruncated: result.recallTruncated,
    };
  } catch (error) {
    raiseSessionError(i18n, error);
  }
}
