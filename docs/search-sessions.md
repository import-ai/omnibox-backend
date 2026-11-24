# Resource search paging

Resource semantic search is stateless across requests. The Backend owns paging
with a plain offset/limit window over the Wizard's ranked chunk results; the only
state is a per-process cache that avoids refetching the same raw pages within a
short window.

## Public API

POST /api/v1/namespaces/:namespace_id/search accepts query, type, match_mode,
conditions, offset and limit. The response is items, total, offset and limit:

- items: the requested page of permission-visible resources;
- total: number of visible resources accumulated so far (a lower bound while raw
  Wizard pages remain, exact once they are exhausted);
- offset/limit: the normalized request window.

GET /api/v1/namespaces/:namespace_id/search returns the resource picker array
directly. GET /open/api/v1/search keeps its legacy array response.

Message search and database-only resource filter search (empty query plus
conditions) keep their existing paths and response shapes.

## Semantic resource paging

searchPaginated normalizes offset/limit (default limit 20, max 100), checks
namespace access and filter candidate ids, then accumulates resources:

- the cache key is user + namespace + query + filter-id hash; entries expire
  after 30 s, and one process keeps at most 100 entries and 2000 items;
- each round calls Wizard POST /internal/api/v1/wizard/search with type=chunk,
  offset=nextSearchOffset, limit=100 and resource_ids;
- chunk hits are collapsed to resources in Wizard rank order, article copies
  (same feed URL/guid) are deduplicated, and permissions are checked per batch;
- accumulation stops at offset+limit+1 visible resources or when the Wizard
  returns fewer than 100 records;
- the page is items[offset:offset+limit]; cached pages recheck current
  permissions and resource metadata before they are returned.

There is no search session, search_id or pending response. A cache miss or
expiry rebuilds from raw offset 0; a short or empty page is a plain result.
