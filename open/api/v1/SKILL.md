# OmniBox Open API v1 Skill

Use this skill when integrating external tools, plugins, or agents with OmniBox through the public Open API.

## Base URL and documentation

- Cloud service base URL: `https://api.omnibox.pro`
- Self-hosted base URL: `<your-server>/open/api`
- API version prefix: `/open/api/v1`
- Swagger UI: `/open/api/docs`

In Swagger, routes are shown relative to `/open/api`, for example `/v1/resources`.

## Authentication

All Open API v1 endpoints require an API key unless explicitly documented otherwise.

```http
Authorization: Bearer <api-key>
```

API keys are scoped to:

- one user
- one namespace / workspace
- one root resource
- an explicit permission matrix

Resource and search endpoints must stay within the API key root resource boundary. Do not expose or assume access to resources outside that root.

## Permission matrix

| Target | Actions | Typical endpoints |
| --- | --- | --- |
| `resources` | `create`, `read`, `update`, `delete` | `/v1/resources`, `/v1/resources/{id}`, `/v1/resources/upload`, `/v1/wizard/collect/*` |
| `tags` | `create`, `read` | `/v1/tags` |
| `search` | `read` | `/v1/search` |
| `chat` | `create` | `/v1/wizard/ask` |

When adding endpoints, reuse an existing target/action if the semantics match. Add new permission targets only when the existing matrix cannot express the capability safely.

## Current capability scope

### API keys

- `GET /v1/api-keys/info`: inspect the current API key and its scope.
- `DELETE /v1/api-keys`: revoke the current API key and related applications.

API key creation and broad management remain in the authenticated product API, not the public Open API.

### Resources

- `GET /v1/resources`: list resources under the API key root.
- `POST /v1/resources`: create a document resource.
- `GET /v1/resources/{resourceId}`: read a resource under the API key root.
- `PATCH /v1/resources/{resourceId}`: update a resource under the API key root.
- `DELETE /v1/resources/{resourceId}`: delete a resource under the API key root.
- `POST /v1/resources/upload`: upload a file as a resource.

Use `parent_id` only for resources reachable under the API key root. If `parent_id` is omitted, use the API key root.

### Web collection and AI wizard

- `POST /v1/wizard/collect/gzip`: collect web content from uploaded gzip-compressed HTML.
- `POST /v1/wizard/collect/url`: create a URL collection task.
- `POST /v1/wizard/ask`: ask the AI wizard with Open API context.

Collection endpoints require `resources:create`. Ask requires `chat:create`.

### Tags

- `POST /v1/tags`: create a tag in the API key namespace.
- `GET /v1/tags`: list or query tags by `name`, `id`, or `ids`.

### Search

- `GET /v1/search`: search resources visible within the API key root.

## Error and compatibility rules

- Keep Open API v1 routes, request fields, response shapes, and permission semantics backward compatible.
- Do not rename existing fields or change successful response shapes without introducing a new version.
- Use the existing `AppException` + i18n error pattern for business errors.
- Return standard HTTP status codes:
  - `400`: invalid request or missing required content
  - `401`: missing or invalid API key
  - `403`: insufficient permission or out-of-scope access
  - `404`: resource not found within the API key scope
- Never leak internal IDs or resources outside the API key namespace/root boundary.

## Rate limits and safety

No dedicated Open API rate limiter is defined in this module yet. Until one is added, design new endpoints as if they may be called by automation:

- validate and bound pagination (`limit`, `offset`)
- avoid unbounded tree walks or full namespace scans
- avoid large synchronous AI or file-processing work when a task-based flow exists
- prefer async task creation for slow operations

## Implementation checklist for new Open API endpoints

1. Place public routes under `open/api/v1/*`.
2. Register controllers in `OpenAPIModule` so `/open/api/docs` includes them.
3. Protect routes with `@APIKeyAuth()` and the minimal permission target/action.
4. Enforce namespace and root resource scope using API key attrs.
5. Add Swagger decorators (`@ApiTags`, `@ApiSecurity`, `@ApiOperation`, `@ApiResponse`, `@ApiBody` when needed).
6. Add or update DTOs with `RequestDto` / `ResponseDto` suffixes where applicable.
7. Add targeted unit/e2e coverage beside the feature.
8. Keep `/open/api/docs` free of internal `/api/v1` and `/internal/api/v1` routes.

## Example requests

```bash
curl -H "Authorization: Bearer $OMNIBOX_API_KEY" \
  "https://api.omnibox.pro/v1/resources?limit=20&summary=true"
```

```bash
curl -X POST \
  -H "Authorization: Bearer $OMNIBOX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"API note","content":"Saved from Open API"}' \
  "https://api.omnibox.pro/v1/resources"
```
