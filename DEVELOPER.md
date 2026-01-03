# DEVELOPER.md

This file provides guidance to developer when working with code in this repository.

## Commands

```bash
# Install dependencies
pnpm install

# Development (watch mode)
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
- `resources/` - Resource tree (hierarchical data structure)
- `tasks/` - Task/job management
- `conversations/`, `messages/` - Chat functionality
- `attachments/` - File attachments via S3
- `shares/` - Resource sharing system
- `api-key/` - API key CRUD operations
- `permissions/`, `groups/` - Access control
- `search/` - Meilisearch integration

### Authentication System

Three authentication methods coexist via global guards (in order):
1. **JWT** (default) - Bearer token in Authorization header
2. **API Key** - `sk-` prefixed keys, use `@APIKeyAuth()` decorator
3. **Cookie** - JWT in `token` cookie, use `@CookieAuth()` decorator
4. **Public** - Use `@Public()` to skip auth

See `src/auth/api-key/README.md` and `src/auth/cookie/README.md` for detailed usage.

### Database Migrations

Migrations run automatically on app startup (`migrationsRun: true`). No CLI commands needed.

**To create a new migration:**
1. Create `src/migrations/{timestamp}-{description}.ts` (use `date +%s%3N` to generate timestamp with milliseconds)
2. Import and register in `src/app/app.module.ts` migrations array
3. Use `BaseColumns()` from `src/migrations/base-columns.ts` for standard audit fields

See `src/migrations/README.md` for migration template and patterns.

### Environment Variables

Key configuration (prefix `OBB_`):
- `OBB_PORT` - Server port (default: 8000)
- `OBB_POSTGRES_URL` - PostgreSQL connection string
- `OBB_REDIS_URL` - Redis connection (optional)
- `OBB_JWT_SECRET` - JWT signing secret
- `OBB_JWT_EXPIRE` - Token expiry (default: 2678400s)
- `OBB_LOG_LEVELS` - Comma-separated log levels (default: error,warn,log)
- `OBB_DB_LOGGING` - Enable TypeORM query logging
- `OBB_DB_SYNC` - Enable schema sync (dev only)

### API Documentation

Swagger UI available at:
- `/docs` - Internal API documentation
- `/open/api/docs` - Public Open API documentation

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

- "Generated with Claude Code" or similar attribution
- "Co-Authored-By: Claude" or any Claude co-author tags
