# Resource search paging

Resource semantic search is stateless across requests. The Backend owns paging
with a plain offset/limit window over the Wizard's ranked chunk results; the only
state is a per-process cache that avoids refetching the same fused recall list
within a short window.

## Public API

POST /api/v1/namespaces/:namespace_id/search accepts query, type, match_mode,
conditions, offset and limit. The response is items, total, offset and limit:

- items: the requested page of permission-visible resources;
- total: number of permission-visible resources in the fixed-depth recall list;
- offset/limit: the normalized request window.

GET /api/v1/namespaces/:namespace_id/search returns the resource picker array
directly. GET /open/api/v1/search keeps its legacy array response.

Message search and database-only resource filter search (empty query plus
conditions) keep their existing paths and response shapes.

## Semantic resource paging

searchPaginated normalizes offset/limit (default limit 20, max 100), checks
namespace access and filter candidate ids, then pages one fixed-depth list:

- the cache key is user + namespace + query + filter-id hash; entries expire
  after 30 s, and one process keeps at most 100 entries and 2000 items;
- a cache miss calls Wizard POST /internal/api/v1/wizard/search once with
  type=chunk, offset=0, limit=200 (the internal recall depth, capped at 400) and
  resource_ids; page 2 and later slice that same fused list instead of asking
  the Wizard for a deeper window fused at a different depth;
- chunk hits are collapsed to resources in Wizard rank order, article copies
  (same feed URL/guid) are deduplicated, and permissions are checked per batch;
- the page is items[offset:offset+limit]; cached pages recheck current
  permissions and resource metadata before they are returned;
- total is the exact number of visible resources in the fixed-depth list. An
  offset beyond the list returns an empty page with that total, and resources
  the Wizard ranks below the recall depth are not returned.

If the Wizard reports a partial result (one retrieval branch failed), the
Backend retries the fixed-depth fetch once. A still-partial page is served for
the requested offset but not cached, so the next request fetches it again.

There is no search session, search_id or pending response. A cache miss or
expiry rebuilds from the same fixed-depth fetch.
