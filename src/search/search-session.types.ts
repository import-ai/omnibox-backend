import { IndexRecordDto } from 'omniboxd/wizard/dto/index-record.dto';

import { IndexedResourceDto } from './dto/indexed-doc.dto';

export interface SessionPagination {
  offset: number;
  limit: number;
  paginationVersion?: number;
  searchId?: string;
  requestId?: string;
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
  relevanceEnabled: boolean;
  policySignature: string;
}

export interface SessionState {
  fingerprint: string;
  query: string;
  depth: number;
  snapshot: SearchSnapshot;
  cursor: number;
  confirmed: IndexedResourceDto[];
  articles: string[];
  decisions: Record<
    number,
    { status: 'kept' | 'rejected' | 'pending'; item?: IndexedResourceDto }
  >;
  attempts: Record<number, number>;
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
