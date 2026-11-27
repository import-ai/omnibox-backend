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
- one Namespace
- one root resource, or Personal + Team within the same namespace
- a permission matrix

Important rules for agents:

- Never assume access to the full namespace. A legacy/resource key can only access its root and descendants. A `personal_and_team` key can access the owner's Personal tree and the Team tree, intersected with the owner's current permissions. Other members' Personal trees are excluded.
- Existing keys keep their scope. New keys default to Personal; users must explicitly choose Personal + Team.
- For a combined key, `GET /resources` without `parent_id` returns the Personal and Team entry folders with `total`; list their children by passing an entry ID as `parent_id`.
- For creation, collection, and upload, an explicit `parent_id` takes precedence. Otherwise a combined key uses `default_save_resource_id` when configured, or Personal. Existing assistant save destinations are preserved when widening scope.
- An invalid or inaccessible explicit/default save destination is an error, never a reason to save elsewhere. Updates and deletes act on the original resource in place.
- Resource scope and action permissions are independent. Widening scope does not grant create/update/delete permissions.
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

Use `GET /api-keys/info` to inspect the current user, namespace, namespace tier, usage limits, and `open_api_requests_quota.limit`, `used`, `remaining`, and `reset_at`.

## Common workflows

### Read document comments

Requires `resources:read`, a resource inside the API key scope, and current space membership and view access. Both endpoints are read-only and consume the usual Open API quota, including each additional page. Some failed requests may also consume quota.

- `GET /resources/<resource_id>/comment-threads?type=all&offset=0&limit=20`
- `GET /resources/<resource_id>/comment-threads/<thread_id>/comments?offset=0&limit=20`

Thread filters: `type=all|document|inline` (default `all`) and optional `resolved=true|false` (omit for both states). Both endpoints accept decimal integer `offset` (default `0`, minimum `0`) and `limit` (default `20`, range `1–100`). Empty, fractional, negative, repeated and scientific-notation pagination values are rejected with `400`.

Both responses contain `items`, `total`, `offset`, `limit`, and `has_more`. The thread endpoint counts threads and previews only the earliest surviving comment in each thread. Its `comments_pagination` contains the comment total, `offset=0`, `limit=1`, and `has_more`. To read the rest, continue through the comments endpoint from `offset=1`, or read the entire thread independently from `offset=0`. The comment endpoint counts comments and includes `mention_display_names` for the current page.

Comments and threads are ordered by creation time, then ID, ascending. Deletions may leave a reply as the earliest surviving comment; do not assume it is the original message or invent parent-comment relationships. Pagination is consistent within one request; changes between requests may shift offsets. Traverse a stable dataset for a complete export.

Document comments have `anchor=null` and empty `quoted_text`; inline anchors use the editor's stored positions, not Markdown offsets. Orphaned anchors and resolved threads remain readable. `author` and `creator` contain only nullable `id` and `display_name`, including retained member name snapshots. Stored content and mention shortcodes are preserved. Image-only comments can have empty content. Attachments expose only `id`, `name`, `mimetype`, and `size`; this release does not provide attachment download URLs or binaries through these endpoints.

An accessible resource with no comments returns `items=[]`, `total=0`, and `has_more=false`. An offset beyond the last item returns an empty page with the actual total. Errors follow the existing API: `400` invalid input, `401` invalid key, `403` scope or access denied, `404` missing resource/thread (including a thread from another resource), `429` quota exhausted. This API cannot create, edit, delete, or resolve comments.

Complete traversal example (Python standard library; `OMNIBOX_API_BASE` includes `/v1`, e.g. `${OBB_OPEN_API_BASE_URL}/v1`):

```python
import json
import os
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

base = os.environ['OMNIBOX_API_BASE'].rstrip('/')
key = os.environ['OMNIBOX_API_KEY']
resource_id = quote(os.environ['OMNIBOX_RESOURCE_ID'], safe='')

def get_json(path, params):
    request = Request(
        f'{base}{path}?{urlencode(params)}',
        headers={'Authorization': f'Bearer {key}'},
    )
    with urlopen(request, timeout=30) as response:
        return json.load(response)

thread_path = f'/resources/{resource_id}/comment-threads'
thread_offset = 0
while True:
    page = get_json(thread_path, {'type': 'all', 'offset': thread_offset, 'limit': 20})
    for thread in page['items']:
        comments = list(thread['comments'])
        metadata = thread['comments_pagination']
        comment_offset = metadata['offset'] + len(comments)
        while metadata['has_more']:
            path = f"{thread_path}/{quote(thread['id'], safe='')}/comments"
            reply_page = get_json(path, {'offset': comment_offset, 'limit': 100})
            if not reply_page['items'] and reply_page['has_more']:
                raise RuntimeError('Pagination made no progress')
            comments.extend(reply_page['items'])
            comment_offset = reply_page['offset'] + len(reply_page['items'])
            metadata = reply_page
        print(json.dumps({'thread_id': thread['id'], 'comments': comments}, ensure_ascii=False))
    if not page['has_more']:
        break
    if not page['items']:
        raise RuntimeError('Pagination made no progress')
    thread_offset = page['offset'] + len(page['items'])
```


### Understand OmniBox workspace resource URLs

OmniBox workspace resource URLs use this path route:

```text
/<namespace_id>/<resource_id>[/edit]
```

The first path segment is the namespace ID and the second is the resource ID. The optional `/edit` suffix, query string, and fragment do not change those IDs. When given one of these URLs, compare its namespace ID with the namespace returned by `GET /api-keys/info`, then read the resource with `GET /resources/<resource_id>`.

### Inspect the current API key

Call this first when you need to understand the current user, namespace, namespace tier, usage and quota limits, root resource, or permissions. Do not guess this information from prior messages.

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
  "tag_names": ["optional-tag-name"]
}
```

Requires `resources:create`.

Notes:

- `resource_type` defaults to `doc`.
- Document resources require non-empty `content`.
- If `parent_id` is omitted, the document uses the default save destination described above.
- `tag_names` contains tag names, not tag IDs. Each tag name must be non-empty and at most 20 characters. Missing tags are created automatically.

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
- If `parent_id` is omitted, the folder uses the default save destination described above.

### Update a resource

```http
PATCH /resources/<resourceId>
Content-Type: application/json

{
  "name": "Updated name",
  "content": "Updated content",
  "parent_id": "optional-parent-resource-id",
  "tag_names": ["optional-tag-name"]
}
```

Requires `resources:update`.

Use `parent_id` to move a resource. `tag_names` contains tag names, not tag IDs. Each tag name must be non-empty and at most 20 characters. Missing tags are created automatically. `tag_names` replaces the resource's existing tags; send `tag_names: []` to clear tags.

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

### Operate resource attachments

List attachments and retrieve their metadata and authenticated download URLs:

```http
GET /resources/<resourceId>/attachments
```

Download an attachment:

```http
GET /resources/<resourceId>/attachments/<attachmentId>
```

These read operations require `resources:read`.

Upload one or more attachments to an existing resource:

```http
POST /resources/<resourceId>/attachments
Content-Type: multipart/form-data

file[]=<binary-file>
```

Delete an attachment:

```http
DELETE /resources/<resourceId>/attachments/<attachmentId>
```

Upload and delete require `resources:update`. The resource must be within the
API key root scope. Attachment download URLs require the same API key and must
not be treated as public URLs.

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
