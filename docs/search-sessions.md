# Stable resource search sessions

Resource semantic search uses one fixed candidate snapshot per session. The
Backend owns the resource sequence and scanning progress. Both GET resource
pickers and legacy/v2 POST resource search delegate to this engine; message search
and database-only resource filters retain their existing paths.

## Protocol

POST /api/v1/namespaces/:namespace_id/search accepts optional pagination_version
(1 or 2), search_id and request_id, alongside query, conditions, match_mode,
offset and limit. Version 2 requires request_id; the first request omits search_id.
The same initial request ID deterministically identifies the same owner-scoped
session. Subsequent requests include search_id and use the returned next_offset.
Network retries reuse request_id. A partial-page continuation uses a new request ID.

V2 responses contain items, offset, limit, search_id, next_offset, total, has_more,
status and recall_truncated. While processing is incomplete, total is null and
status is partial, including an empty page with unchanged next_offset. Complete
means candidate processing finished; has_more may still be true while confirmed
resources remain unread. Total counts confirmed resources in the bounded snapshot,
not all possible corpus matches. recall_truncated independently indicates a branch
lookahead passed the gate beyond the configured depth.

V1 shares the engine and uses an implicit user/namespace/query/filter session. Its
public response remains items/offset/limit/numeric total. An unfinished nonempty
page has a lower-bound total, never an invented exact count. An unfinished empty
page returns search_pending (503), not total=0; retrying the same offset resumes
the session cursor. The current Web sends semantic queries as V2 and does not
auto-retry an HTTP error. A failed page, including search_pending from the scan or
time budget, stops the page load and shows a manual Retry or Restart action.
Automatic continuation applies only to a successfully returned partial
page whose items are empty and has_more=true: the Web advances to the next offset
at most twice, 400 ms apart, before waiting for the user. A completed empty page
renders the empty result. Without an explicit session ID, V1 cannot isolate
identical searches in separate windows or guarantee continuity after
implicit-session expiry. The current Web keeps numeric-total database-only filter
searches compatible.

The Open API `GET /open/api/v1/search` retains its legacy array response: it
returns the records it received, including short pages and empty results, without
a pending status.

## Ordering

All enabled Weaviate branches must succeed before the snapshot is published. The
snapshot is fused once and globally collapsed by resource ID, keeping the first
ranked representative chunk. Article copies are collapsed using the existing
feed-URL/guid identity. Unknown, deleted or unreadable unconfirmed candidates are
skipped while advancing progress.

The published resource list is append-only. Every visible, non-duplicate candidate
is confirmed in snapshot order; the search path runs no model judgment. The
representative-chunk policy is global and deterministic.

Every confirmed resource is stored as its snapshot position plus display metadata
(record id, resource, title, attrs, type and read-only flag). The matched chunk
text stays in the snapshot and is rehydrated when a page is returned or replayed,
so confirmation never creates a second copy of the text. A depth-400 probe (781
chunks, about 1.45 MB of serialized matched text) therefore keeps all its confirmed
hits inside the durable per-session byte bound; regression coverage pins the
previous 2 MiB bound for that shape. Attrs are the ones captured when the candidate
was confirmed; permissions and resource existence are rechecked per page.

Before returning or replaying a confirmed page, current permissions and resource
existence are rechecked. Losing a confirmed resource invalidates the session.
Its old response must not be replayed, and the client starts a new search explicitly.
Query/filter mismatches invalidate the request. A new search builds a fresh
snapshot with the current configuration.

## Storage and bounds

The store uses OBB_REDIS_URL. Redis is required outside unit tests unless single-process local memory is
explicitly enabled with OBB_SEARCH_SESSION_MEMORY=true; production/pre environments
still require Redis. Redis failures never trigger an
in-memory fallback. Owner-scoped leases and compare-owner commits reject stale
writers and simultaneous mutation. Each response range is memoized by request ID;
reusing an ID with a different offset/limit returns search_request_conflict.

Initial bounds: a 120-second idle TTL, 1000 shared sessions
(OBB_SEARCH_SESSION_MAX_SESSIONS), three active sessions per user/namespace
(OBB_SEARCH_SESSION_MAX_USER_SESSIONS; least recently active is retired on
replacement), 4 MiB per session (OBB_SEARCH_SESSION_MAX_BYTES) including
idempotency records, and 128 request IDs per session. The shared session
count is an eviction bound, not a failure threshold: creating a session at the
bound retires the globally least recently active session first, so ordinary
traffic is never rejected because the store is full. Only a per-session size
overflow and the per-session request-ID bound answer search_capacity (429).
Retirement deletes the session and its lease atomically, so a writer still holding
the old lease fails its compare-owner commit instead of resurrecting the session.
The counts and byte bound are configurable per deployment; raising the byte bound
keeps depth-400 snapshots with unusually long chunks durable, and lowering the
session count trades retired V2 sessions (410) for Redis memory. Existing
expired/retired V2 session IDs return search_session_expired (410), never silently
rebuild. Session ownership includes the authenticated user and namespace; knowing
an ID grants no access.

OBB_SEARCH_RECALL_DEPTH accepts 200 (provisional default) or 400 per branch. A read-only 200/400 comparison on five test queries retained the same target ranks.
The Chinese-title query returned 395 versus 781 chunks (656450 versus 1448183
serialized bytes); its single-sample retrieval times were 257 versus 420 ms.
The mixed query returned 400 versus 611 chunks, also retaining the target at rank 1.
These are illustrative samples, not a labeled quality benchmark or end-to-end SLA;
the first numeric-query timing included cold-start effects. Keep 200 as the
provisional default and evaluate broader labeled queries before changing it.
Backend resource-candidate cursors index the globally resource-collapsed list, not
the original chunk ranks; trace them as search.resource_candidate_cursor.
Per-response processing scans at most 200 candidate positions, with a 10-second
request budget. Remaining work is saved and continued, not replayed from
candidate zero.

The deferred P2 work is not included: arbitrary-offset restrictions, absolute
session lifetime, initialization crash takeover, and a separate terminal-error
protocol redesign. In particular, initialized snapshots are durable before
scanning, but an interrupted unpublished initialization may be retried. These
limitations must not be described as exactly-once RPC execution or
crash-recoverable building.

## Rollout

Publish the shared library, pin both Wizards to the same SHA, then roll out
Backend (both protocols) before Wizard. No database migration. Do not deploy
Wizard before Backend completes rollout: the old Backend expects snapshot
relevance fields that the new Wizard no longer returns. The Wizard exposes only
/internal/api/v1/wizard/search/snapshot for search. Older Web responses stay
compatible through the V1 adapter. The current Web uses V2 for semantic queries,
does not auto-retry failed pages (manual Retry/Restart), and only auto-continues
successful empty partial pages (at most twice, 400 ms apart).

The shared test environment was paused during implementation and subsequently
restored by another operation to its existing images. Only a read-only candidate
comparison was run after restoration. The requester prohibits deployment for this
change; publication-triggered build/deployment workflows were cancelled.
