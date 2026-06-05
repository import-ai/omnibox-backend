# OmniBox Open API v1 Skill

Use this skill to call OmniBox Open API on behalf of a user. The API lets agents create, read, update, delete, tag, search, collect, upload, and ask AI over resources inside the API key's authorized scope.

## Endpoint base

Open API base URL:

```text
${OBB_OPEN_API_BASE_URL}/v1
```

Swagger/OpenAPI docs:

```text
${OBB_OPEN_API_BASE_URL}/docs
```

Use the base URL above for all requests in this skill. Paths below are relative to that base, for example `GET /resources` means `GET ${OBB_OPEN_API_BASE_URL}/v1/resources`.

## Authentication

Every request needs an API key:

```http
Authorization: Bearer <api-key>
```

Do not put API keys in logs, chat messages, documents, or URLs. If a request fails with `401`, ask the user for a valid API key or have them create one in OmniBox.

## Scope and safety rules

An API key is scoped to:

- one user
- one namespace / workspace
- one root resource
- a permission matrix

Important rules for agents:

- Never assume access to the full namespace. Only operate under the API key root resource.
- If `parent_id` is omitted when creating/listing resources, the API key root resource is used.
- Only use `parent_id` values returned by this Open API or explicitly provided by the user.
- For `403`, explain that the API key lacks permission or the target is outside scope.
- For `404`, treat the resource as not visible within this API key scope; do not guess other IDs.
- Prefer small paginated reads. Use `limit` and `offset` for list/search calls.

## Permissions

| Target      | Actions                              | Used for                                                   |
| ----------- | ------------------------------------ | ---------------------------------------------------------- |
| `resources` | `create`, `read`, `update`, `delete` | resources, folders, files, tag association, web collection |
| `tags`      | `create`, `read`                     | tag lifecycle and tag lookup                               |
| `search`    | `read`                               | search resources under the API key root                    |
| `chat`      | `create`                             | ask AI wizard                                              |

When an endpoint returns `403`, inspect the needed permission in the endpoint list below.

## Quota

Most Open API business read, update, delete, tag, and search requests consume the namespace-level Open API request quota. When the quota is exhausted, quota-limited endpoints return `429` with `open_api_requests_per_24h_exceeded`.

These endpoints do not consume Open API request quota:

- `GET /api-keys/info`
- `DELETE /api-keys`
- `POST /resources`
- `POST /resources/upload`
- `POST /wizard/collect/url`
- `POST /wizard/collect/gzip`
- `POST /wizard/ask`

Use `GET /api-keys/info` to inspect `open_api_requests_quota.limit`, `used`, `remaining`, and `reset_at`.

## Common workflows

### Inspect the current API key

Call this first when you need to understand the key's namespace, root resource, and permissions.

```http
GET /api-keys/info
```

### List resources

```http
GET /resources?limit=20&offset=0&summary=false
GET /resources?parent_id=<resourceId>&limit=20&offset=0
```

Requires `resources:read`.

Response shape:

```json
{
  "resources": [
    {
      "id": "resource-id",
      "name": "Resource name",
      "resource_type": "doc"
    }
  ],
  "total": 42
}
```

`total` is the full number of visible resources matching the same parent scope before `limit` and `offset` are applied.

### Read one resource, content, and tags

```http
GET /resources/<resourceId>?content_offset=0&content_limit=100
```

Requires `resources:read`. The response includes `tags`, so use this endpoint to see the tags on a specific resource.

Resource `content` is returned as a string and is paginated by lines. Use `content_offset` and `content_limit` to read long resources in chunks.

Response shape excerpt:

```json
{
  "id": "resource-id",
  "name": "Resource name",
  "content": "line 1\nline 2",
  "content_pagination": {
    "offset": 0,
    "limit": 100,
    "total_lines": 200
  },
  "tags": []
}
```

### Create a document resource

```http
POST /resources
Content-Type: application/json

{
  "name": "API note",
  "resource_type": "doc",
  "content": "Saved from Open API",
  "parent_id": "optional-parent-resource-id",
  "tag_ids": ["optional-tag-id"]
}
```

Requires `resources:create`.

Notes:

- `resource_type` defaults to `doc`.
- Document resources require non-empty `content`.
- If `parent_id` is omitted, the document is created under the API key root resource.

### Create a folder resource

```http
POST /resources
Content-Type: application/json

{
  "name": "Folder name",
  "resource_type": "folder",
  "parent_id": "optional-parent-resource-id"
}
```

Requires `resources:create`.

Rules:

- Folder resources require non-empty `name`.
- Do not send `content` for folders.
- If `parent_id` is omitted, the folder is created under the API key root resource.

### Update a resource

```http
PATCH /resources/<resourceId>
Content-Type: application/json

{
  "name": "Updated name",
  "content": "Updated content"
}
```

Requires `resources:update`.

### Delete a resource

```http
DELETE /resources/<resourceId>
```

Requires `resources:delete`.

### Upload a file as a resource

```http
POST /resources/upload
Content-Type: multipart/form-data

file=<binary-file>
parsed_content=<optional-text-content>
```

Requires `resources:create`.

### Add a tag to a resource

```http
POST /resources/<resourceId>/tags
Content-Type: application/json

{
  "tag_name": "project"
}
```

Requires `resources:update`. Existing resource tags are preserved. If the tag name does not exist in the namespace, the API creates it.

### Remove a tag from a resource

```http
DELETE /resources/<resourceId>/tags/<tagId>
```

Requires `resources:update`.

### Create or query tags

```http
POST /tags
Content-Type: application/json

{
  "name": "project"
}
```

Requires `tags:create`.

```http
GET /tags?name=project&limit=20&offset=0
GET /tags?ids=<tagId1>,<tagId2>
GET /tags?id=<tagId>
```

Requires `tags:read`.

### Search resources

```http
GET /search?query=<query>&limit=20&offset=0
```

Requires `search:read`. Search is limited to resources visible within the API key root.

### Collect web content

```http
POST /wizard/collect/url
Content-Type: application/json

{
  "url": "https://example.com/article",
  "parent_id": "optional-parent-resource-id"
}
```

```http
POST /wizard/collect/gzip
Content-Type: application/json

{
  "url": "https://example.com/article",
  "gzip": "base64-gzip-html",
  "parent_id": "optional-parent-resource-id"
}
```

Requires `resources:create`. These endpoints create asynchronous collection tasks when needed.

### Ask AI wizard

```http
POST /wizard/ask
Content-Type: application/json

{
  "message": "Question for OmniBox AI",
  "resource_id": "optional-resource-id"
}
```

Requires `chat:create`.

## Response handling

Common status codes:

- `200` / `201`: success
- `400`: invalid request body, missing required field, or unsupported field combination
- `401`: missing or invalid API key
- `403`: insufficient permission or target outside API key scope
- `404`: resource not found within API key scope

When you receive an error:

1. Read the response body for an application error code/message.
2. Do not retry blindly on `400`, `401`, `403`, or `404`.
3. For pagination or search, narrow the request before retrying.
4. Ask the user before destructive actions such as `DELETE /resources/<resourceId>`.

## Curl examples

```bash
curl -H "Authorization: Bearer $OMNIBOX_API_KEY" \
  "${OBB_OPEN_API_BASE_URL}/v1/resources?limit=20&summary=false"
```

```bash
curl -X POST \
  -H "Authorization: Bearer $OMNIBOX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"API note","content":"Saved from Open API"}' \
  "${OBB_OPEN_API_BASE_URL}/v1/resources"
```

```bash
curl -X POST \
  -H "Authorization: Bearer $OMNIBOX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Folder name","resource_type":"folder"}' \
  "${OBB_OPEN_API_BASE_URL}/v1/resources"
```

```bash
curl -X POST \
  -H "Authorization: Bearer $OMNIBOX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tag_name":"project"}' \
  "${OBB_OPEN_API_BASE_URL}/v1/resources/<resourceId>/tags"
```
