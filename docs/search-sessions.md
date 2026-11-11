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
page returns search_pending (503), not total=0. Without an explicit session ID,
V1 cannot isolate identical searches in separate windows or guarantee continuity
after implicit-session expiry. The new Web uses V2 for semantic queries and keeps
numeric-total database-only filter searches compatible.

## Ordering and judgment

All enabled Weaviate branches must succeed before the snapshot is published. The
snapshot is fused once and globally collapsed by resource ID, keeping the first
ranked representative chunk. Article copies are collapsed using the existing
feed-URL/guid identity. Unknown, deleted or unreadable unconfirmed candidates are
skipped while advancing progress.

The published resource list is append-only. If relevance is enabled, judgments of
later candidates may finish first, but cannot pass an unresolved prefix. Pending
attempts accumulate across requests; three unresolved attempts terminate the
session with search_judgment_failed. Detector failures are not relevance rejections.
With relevance disabled, the same engine skips judgment calls, not snapshot state.
The representative-chunk policy is global and deterministic; it does not promise
that every chunk of a rejected resource will be reconsidered.

Before returning or replaying a confirmed page, current permissions and resource
existence are rechecked. Losing a confirmed resource invalidates the session.
Its old response must not be replayed, and the client starts a new search explicitly.
Query/filter mismatches invalidate the request. Snapshot policy is frozen; a judge
running a different policy signature invalidates the session. A new search uses
current configuration; V1 may retain the frozen policy until its short cache expires.

## Storage and bounds

The store uses OBB_REDIS_URL. Production NODE_ENV requires Redis; memory storage
is for a single development/test process only. Redis failures never trigger an
in-memory fallback. Owner-scoped leases and compare-owner commits reject stale
writers and simultaneous mutation. Each response range is memoized by request ID;
reusing an ID with a different offset/limit returns search_request_conflict.

Initial bounds: 120-second idle TTL, 100 shared sessions, three active sessions per
user/namespace (least recently active is retired on replacement), 2 MiB per session
including pending state and idempotency records, and 128 request IDs per session.
Capacity failures are explicit (429). Existing expired/retired V2 session IDs return
search_session_expired (410), never silently rebuild. Session ownership includes
the authenticated user and namespace; knowing an ID grants no access.

OBB_SEARCH_RECALL_DEPTH accepts 200 (provisional default) or 400 per branch. A live
200/400 latency/recall comparison remains a rollout gate; the test services were
scaled to zero during implementation, so no completed live calibration is claimed.
Per-response processing scans at most 200 candidate positions, with a 10-second
request budget and at most three seconds per judgment request. Remaining work is
saved and continued, not replayed from candidate zero.

The deferred P2 work is not included: arbitrary-offset restrictions, absolute
session lifetime, initialization crash takeover, and a separate terminal-error
protocol redesign. In particular, initialized snapshots are durable before judging,
but an interrupted unpublished initialization may be retried. These limitations
must not be described as exactly-once RPC execution or crash-recoverable building.

## Rollout

Publish the shared library, pin both Wizards to the same SHA, then roll out Wizard,
Backend (both protocols) and Web. No database migration. Do not deploy Backend
before Wizard exposes /internal/api/v1/wizard/search/snapshot and /search/judge.
Older Web responses stay compatible through the V1 adapter. Disabling model
relevance does not disable stable snapshots or thresholds.

The shared test environment was observed scaled to zero by another operation.
Do not restore replicas or run deployment webhooks as part of verification without
resuming that environment intentionally.
