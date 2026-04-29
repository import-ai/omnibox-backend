# DEVELOPER.md

This file provides guidance to agents and developers working in the backend repository. `AGENTS.md` is a symlink to this file, so update this document when backend practices change.

## Commands

Use Node 22 (see `.node-version`) and pnpm (the package manager is pinned in `package.json`).

```bash
# Install dependencies
pnpm install

# Development
pnpm run dev

# Production build & run
pnpm run build
pnpm run start:prod

# Linting and formatting
pnpm run lint        # Check only
pnpm run lint:fix    # Auto-fix & format code
```

### Testing

```bash
# Unit tests (*.spec.ts files)
pnpm run test
pnpm run test:watch

# E2E tests (*.e2e-spec.ts files) - uses testcontainers
pnpm run test:e2e
pnpm run test:e2e:remote

# Run single test file
pnpm run test -- path/to/file.spec.ts
pnpm run test:e2e -- path/to/file.e2e-spec.ts
```

E2E tests use `testcontainers` to spin up PostgreSQL and MinIO containers. The test client (`test/test-client.ts`) provides authenticated HTTP request helpers.

### Docker Development

```bash
# Watch mode with hot reload
docker compose -f base.yaml -f dev.yaml up -d

# Build mode (production-like)
docker compose -f base.yaml -f build.yaml up -d --build

# Add persistence for data
docker compose ... -f persistence.yaml ...
```

## Architecture Overview

This is a **NestJS** backend service using:

- **PostgreSQL** + **TypeORM** for database
- **MinIO/S3** for object storage
- **Redis** for caching (optional, falls back to in-memory)
- **Meilisearch** for search functionality
- **Kafka** for event streaming

### Path Alias

All imports use the `omniboxd/*` path alias which maps to `src/*`:
```typescript
import { UserService } from 'omniboxd/user/user.service';
```

### Module Structure

Each feature is organized as a NestJS module in `src/`:

- `auth/` - JWT, API key, cookie authentication with social login (Google, Apple, WeChat)
- `user/` - User management and profile
- `namespaces/` - Workspace/organization containers
- `namespace-resources/` - Namespace-scoped resource HTTP API, permission checks, resource DTOs, trash and revision endpoints
- `resources/` - Resource tree persistence, storage accounting, indexing tasks, and resource revision services
- `tasks/` - Task/job management
- `conversations/`, `messages/` - Chat functionality
- `attachments/`, `files/` - File metadata and attachment handling via S3/MinIO
- `shares/` - Resource sharing system
- `api-key/` - API key CRUD operations
- `permissions/`, `groups/` - Access control
- `storage-usages/` - Per-namespace and per-user storage accounting
- `search/` - Meilisearch integration
- `vfs/`, `vfs-tags/`, `vfs-wizard/` - Virtual file system surfaces and wizard integration
- `notifications/` - Notification persistence and delivery support

### Authentication System

Authentication modes coexist via global guards (in order):

1. **JWT** (default) - Bearer token in Authorization header
2. **API Key** - `sk-` prefixed keys, use `@APIKeyAuth()` decorator
3. **Cookie** - JWT in `token` cookie, use `@CookieAuth()` decorator
4. **Public** - Use `@Public()` to skip auth

See `src/auth/api-key/README.md` and `src/auth/cookie/README.md` for detailed usage.

### Resource Revisions

Resource version history is implemented across `namespace-resources/` and `resources/`:

- `ResourceRevisionsService` creates snapshots before updates to tracked fields: `name`, `content`, and `tag_ids`. `attrs` changes are not revisioned.
- Revisions are stored in `resource_revisions` and returned newest-first from `GET /api/v1/namespaces/:namespaceId/resources/:resourceId/revisions`.
- The default retention is 3 revisions per resource. `NamespacesQuotaService.getNamespaceUsage()` can override this with `resource_revision_limit`; merge quota responses with defaults because remote usage responses may omit new fields.
- `POST /api/v1/namespaces/:namespaceId/resources/:resourceId/revisions/:revisionId/restore` requires edit permission and `@CheckNamespaceReadonly()`. Restore creates an undo snapshot, updates content storage usage, emits an index task for non-root resources, and rejects name conflicts with `RESOURCE_NAME_CONFLICT`.
- Keep revision DTO code in camelCase; global response interceptors serialize API responses to snake_case.

### Database Migrations

Migrations run automatically on app startup (`migrationsRun: true`). No CLI commands needed.

**To create a new migration:**

1. Create `src/migrations/{timestamp}-{description}.ts` (use `date +%s%3N` to generate timestamp with milliseconds)
2. Import and register in `src/app/app.module.ts` migrations array
3. Use `BaseColumns()` from `src/migrations/base-columns.ts` for standard audit fields
4. Never modify migrations that may already have run; create a follow-up migration instead

See `src/migrations/README.md` for migration template and patterns.

### Environment Variables

Key configuration (prefix `OBB_`):

- `OBB_PORT` - Server port (default: 8000)
- `OBB_POSTGRES_URL` - PostgreSQL connection string
- `OBB_REDIS_URL` - Redis connection (optional)
- `OBB_JWT_SECRET` - JWT signing secret
- `OBB_JWT_EXPIRE` - Token expiry (default: 2678400s)
- `OBB_MINIO_URL` / `OBB_S3_*` - MinIO/S3 storage configuration
- `OBB_KAFKA_BROKER`, `OBB_KAFKA_CLIENT_ID` - Kafka event streaming
- `OBB_WIZARD_BASE_URL` - Wizard service base URL
- `OBB_LOG_LEVELS` - Comma-separated log levels (default: error,warn,log)
- `OBB_DB_LOGGING` - Enable TypeORM query logging
- `OBB_DB_SYNC` - Enable schema sync (dev only)
- `OTEL_EXPORTER_OTLP_ENDPOINT` - OpenTelemetry export target

### API Documentation

Swagger UI available at:

- `/docs` - Internal API documentation
- `/open/api/docs` - Public Open API documentation

### Internal Endpoints

Internal endpoints under `/internal/api/v1/` are for service-to-service communication (e.g., wizard service). They use `@Public()` decorator but should be protected at the network level.

- `internal/api/v1/wizard` - Wizard service callbacks
- `internal/api/v1/wizard/tasks` - Wizard task management
- `internal/api/v1/applications` - Application management
- `internal/api/v1/oauth/clients` - OAuth client registration
- `internal/api/v1/search` - Search indexing
- `internal/api/v1/resources` - Resource operations
- `internal/api/v1/auth` - Auth operations

### Interceptors

Global interceptors applied in order:
1. `SnakeCaseInterceptor` - Transforms camelCase to snake_case in responses
2. `SerializerInterceptor` - Applies class-transformer serialization
3. `UserInterceptor` - Enriches request with user context

### Testing Patterns

E2E tests are colocated with source files (`*.e2e-spec.ts`). Use `TestClient` for authenticated requests:

```typescript
const client = await TestClient.create();
await client.get('/api/v1/endpoint').expect(200);
await client.close();
```

### Code Guidelines

**Exception Handling**: Always raise exceptions with i18n support. Use the internationalization system for all error messages.

**DTO Naming Convention**: New request/response payload DTOs should be suffixed with either `RequestDto` or `ResponseDto` to clearly indicate their purpose. Existing entity-shaped DTOs such as `ResourceDto`, `ResourceRevisionDto`, and `NamespaceUsageDto` may keep their established names.

- `*RequestDto` - For incoming request payloads (e.g., `SendPhoneOtpRequestDto`, `BindPhoneRequestDto`)
- `*ResponseDto` - For outgoing response payloads (e.g., `SendPhoneOtpResponseDto`)

## Git Commit Guidelines

**Format**: `type(scope): Description`

**Types**:

- `feat` - New features
- `fix` - Bug fixes
- `docs` - Documentation changes
- `style` - Styling changes
- `refactor` - Code refactoring
- `perf` - Performance improvements
- `test` - Test additions or changes
- `chore` - Maintenance tasks
- `revert` - Revert previous commits
- `build` - Build system changes

**Rules**:

- Scope is required (e.g., `auth`, `resources`, `user`)
- Description in sentence case with capital first letter
- Use present tense action verbs (Add, Fix, Support, Update, Replace, Optimize)
- No period at the end
- Keep it concise and focused

**Examples**:

```
feat(auth): Support Apple signin
fix(resources): Fix tree ordering on drag-drop
chore(migrations): Add index for namespace lookup
refactor(tasks): Add timeout status handling
```

**Do NOT include**:

- "Generated with xxx" or similar attribution
- "Co-Authored-By: xxx" or any xxx co-author tags
