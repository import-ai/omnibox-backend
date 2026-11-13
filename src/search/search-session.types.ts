import { IndexRecordDto } from 'omniboxd/wizard/dto/index-record.dto';

import { IndexedResourceDto } from './dto/indexed-doc.dto';

export interface SessionParams {
  owner: string;
  fingerprint: string;
  sessionId: string;
  createIfMissing: boolean;
  requestId?: string;
  userId: string;
  namespaceId: string;
  query: string;
  resourceIds: string[] | null;
  offset: number;
  limit: number;
}

export interface SessionResult {
  items: IndexedResourceDto[];
  total: number | null;
  // Advance can overshoot the requested page in batches; the V1 adapter uses
  // the confirmed count for its numeric total lower bound.
  confirmedCount: number;
  nextOffset: number;
  hasMore: boolean;
  status: 'partial' | 'complete';
  recallTruncated: boolean;
}

export interface SessionPage {
  items: IndexedResourceDto[];
  total: number | null;
  offset: number;
  limit: number;
  searchId: string;
  nextOffset: number;
  hasMore: boolean;
  status: 'partial' | 'complete';
  recallTruncated: boolean;
}

export interface SearchSnapshot {
  records: IndexRecordDto[];
  recallTruncated: boolean;
}

// Confirmed hits are stored as snapshot positions plus display metadata. The
// matched text stays in the snapshot and is rehydrated per response, so a
// session never holds a second copy of it.
export type SessionResourceItem = Omit<IndexedResourceDto, 'content'>;

export interface ConfirmedResource {
  index: number;
  item: SessionResourceItem;
}

// Bumped when the persisted session state shape changes; a session written by
// an older backend is treated as expired instead of being read as this shape.
export const SESSION_STATE_VERSION = 3;

export interface SessionState {
  version: number;
  fingerprint: string;
  query: string;
  depth: number;
  snapshot: SearchSnapshot;
  cursor: number;
  confirmed: ConfirmedResource[];
  articles: string[];
  failed?: string;
  requests: Record<
    string,
    {
      offset: number;
      limit: number;
      end: number;
      total: number | null;
      status: 'partial' | 'complete';
      hasMore: boolean;
    }
  >;
}
