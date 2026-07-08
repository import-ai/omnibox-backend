# AGENTS.md

Guidance for coding agents working in this repository.

## Commands

```bash
pnpm install
pnpm run dev          # local watch mode, loads .env through dotenv-cli
pnpm run start        # plain Nest start
pnpm run build
pnpm run start:prod   # node dist/main
pnpm run lint
pnpm run lint:fix
```

Use Node 22 (`.node-version`) and pnpm 10. CI installs with
`pnpm install --frozen-lockfile`.

### Tests

```bash
pnpm run test
pnpm run test -- src/path/to/file.spec.ts
pnpm run test:watch
pnpm run test:e2e
pnpm run test:e2e -- src/path/to/file.e2e-spec.ts
pnpm run test:e2e:remote
```

Unit and e2e tests are colocated under `src/**/*.spec.ts` and
`src/**/*.e2e-spec.ts`. E2E tests use `testcontainers` for PostgreSQL and
MinIO; keep Docker available. Prefer the narrowest relevant test, then run
`pnpm run lint` for code changes. CI runs `pnpm run lint` and
`pnpm run test:e2e --coverage --bail`.

### Docker

```bash
docker compose -f base.yaml -f dev.yaml up -d
docker compose -f base.yaml -f build.yaml up -d --build
docker compose -f base.yaml -f dev.yaml -f persistence.yaml up -d
docker compose -f base.yaml -f dev.yaml -f pgadmin.yaml up -d
```

## Project Shape

This is a NestJS 11 backend (`src/main.ts`) with PostgreSQL + TypeORM,
S3/MinIO, Redis-backed cache with in-memory fallback, Meilisearch, Kafka,
OpenTelemetry, WebSockets, i18n validation, and Swagger docs.

Use the `omniboxd/*` path alias for source imports; it maps to `src/*`.

Main API surfaces:

- `api/v1/*`: normal product API.
- `open/api/v1/*`: public integration API. Swagger is at `/open/api/docs`.
- `internal/api/v1/*`: service-to-service endpoints. They are often marked
  public in code and must be protected at the network/deployment layer.
- Internal Swagger is at `/docs`.

Cloud routing note: `omnibox-website` routes these overlapping paths to
`omnibox-backend-pro`, so changes here will not affect cloud traffic unless
`omnibox-backend-pro` is updated too. Remind the user when touching them:

- `GET /api/v1/config`
- `/api/v1/namespaces/:namespaceId/wizard/*`
- `/api/v1/shares/:shareId/wizard/*`
- Socket.IO path `/api/v1/socket.io`

`/api/v1/wizard/collect*` is the exception in `omnibox-website`: it routes to
this backend, not `omnibox-backend-pro`.

Core modules currently include auth, user, namespaces, namespace resources and
tasks, resources, tags/resource-tags/shared-resource-tags, files,
attachments/resource-attachments, conversations/messages, shares/shared
resources, groups/permissions, invitations, applications, search, wizard,
notifications, smart-folders, open-api quotas, telemetry/trace, Kafka, mail,
phone/SMS, SEO, subscribe-message, and WebSocket support.

## App Wiring

- `src/app/app.module.ts` registers global modules, TypeORM, cache, i18n,
  migrations, middleware, guards, pipes, filters, and interceptors.
- `src/app/app-config.ts` configures JSON/body limits, cookie parsing, JSON
  logging, Swagger, and OpenAPI Swagger.
- Global pipe/filter: `I18nValidationPipe` and
  `I18nValidationExceptionFilter`.
- Global interceptors run as `SnakeCaseInterceptor`, `SerializerInterceptor`,
  then `UserInterceptor`.
- `AccessLogMiddleware` applies to all routes.

Global auth guards are registered in `AuthModule` in this order:

1. `JwtAuthGuard` for default bearer-token JWT auth.
2. `APIKeyAuthGuard` for routes decorated with `@APIKeyAuth()`.
3. `OpenAPIQuotaGuard` for open API quota enforcement.
4. `CookieAuthGuard` for routes decorated with `@CookieAuth()`.

Use `@Public()` only for truly unauthenticated routes. API keys use
`Authorization: Bearer sk-...`; cookie auth uses the `token` cookie.

## Database

Migrations run automatically on app startup (`migrationsRun: true`).

To add a migration:

1. Create `src/migrations/{timestamp}-{description}.ts` with
   `date +%s%3N` for the timestamp.
2. Implement both `up()` and `down()`.
3. Register the migration class in the `migrations` array in
   `src/app/app.module.ts`.
4. Use `BaseColumns()` from `src/migrations/base-columns.ts` for standard
   audit columns when creating tables.

Do not edit migrations that may already have run outside your local database;
add a new migration instead.

## Code Conventions

- Reuse existing modules, services, DTOs, entities, decorators, and helpers
  before adding new ones.
- Keep TypeScript identifiers camelCase. External snake_case fields belong in
  DTO mappings such as `@Expose({ name: 'snake_case' })`.
- For new request/response payloads, prefer `*RequestDto` and `*ResponseDto`
  unless the local module already has a tighter naming pattern.
- Use i18n-aware exceptions and validation messages at API boundaries.
- Let TypeORM/NestJS/platform features do the boring work; do not add new
  dependencies for small utilities.
- Formatting is Prettier (`singleQuote`, trailing commas) plus ESLint flat
  config with `simple-import-sort`.

## Test Helpers

Use `test/test-client.ts` for e2e tests. `TestClient.create()` boots the app,
signs up a user through `/internal/api/v1/sign-up`, initializes a namespace,
creates an API key, and exposes authenticated `get/post/patch/put/delete`
helpers.

## Environment

Start from `example.env` for local development. Configuration keys are mostly
`OBB_*`; search the source for the exact key before adding or renaming one.
Common keys include `OBB_PORT`, `OBB_POSTGRES_URL`, `OBB_REDIS_URL`,
`OBB_JWT_SECRET`, `OBB_JWT_EXPIRE`, `OBB_LOG_LEVELS`, `OBB_DB_LOGGING`,
`OBB_DB_SYNC`, S3/MinIO settings, `OBB_KAFKA_BROKER`, mail/SMS credentials,
OAuth provider credentials, and OpenTelemetry exporter settings.

## Commits

Use `type(scope): Description`.

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`,
`revert`, `build`.

Rules:

- Scope is required, for example `auth`, `resources`, or `user`.
- Description starts with a capital present-tense verb.
- No trailing period.
- Do not include AI tool attribution or co-author tags.

