# OmniBox Backend

## Project Introduction

OmniBox Backend is a backend service developed based on the NestJS framework, providing user authentication, file management, conversation management, and other functionalities.

## Main Features

### File Management

- Supports file upload, download, and management
- Integrated MinIO object storage

### Conversation Management

- Supports multi-user conversations
- Message history records

### Permission Management

- Namespace-based permission control
- User group management
- Resource permission allocation

## Dev

### Docker

- Watch & Debug mode

  ```shell
  docker compose -f base.yaml -f dev.yaml up -d
  ```

- Build mode

  ```shell
  docker compose -f base.yaml -f build.yaml up -d --build
  ```

- Run with persistence postgres and minio data

  ```shell
  docker compose ... -f persistence.yaml ...
  ```

- Run with pgadmin

  ```shell
  docker compose ... -f pgadmin.yaml ...
  ```

Then login with:

| Name     | Value            |
| -------- | ---------------- |
| Username | `omnibox@qq.com` |
| Password | `Passw0rd`       |

### Locally

```bash
# Setup
$ pnpm install

# Development
$ pnpm run start

# Watch mode
$ pnpm run start:dev

# Production mode
$ pnpm run start:prod
```

## App protocol compatibility

Native apps send `X-Client-Platform` (`android` / `ios`), `X-Client-Version`
(installed binary's `major.minor.patch`) and `X-Client-Build` (diagnostic build
identifier) on API and SSE requests. Feature thresholds are centralized in
`src/utils/client-features.ts`; conversation images require version **0.1.50**
or later on both platforms. These headers never grant permissions.

Apps below the threshold, or with missing/invalid versions, receive history
and SSE responses without image display parts. Image-only messages receive a
localized upgrade hint. Stored messages and replay buffers stay unchanged.
Only requests explicitly marked `X-Client-Platform: web` retain the full
representation without a version threshold. Missing/unknown platforms and
missing/invalid native versions use the compatible representation. User-Agent
and request channel are not used for feature negotiation. Deploy the Web client
header change together with this backend change.

Cloud deployment must also update backend-pro's `core` revision because it
serves the namespace/share wizard SSE routes.

## Tech Stack

- **Framework**: NestJS
- **Database**: PostgreSQL + TypeORM
- **Object Storage**: MinIO
- **Authentication**: JWT + Passport
- **Email Service**: Nodemailer
- **Search**: Meilisearch

## Desktop browser authentication

The official public client `omnibox-desktop` uses the shared OAuth authorization-code
flow with mandatory S256 PKCE and the exact redirect URI `omnibox://oauth/callback`.
A migration registers this first-party client; ordinary registration cannot set
first-party status or claim the reserved client ID. No client secret is shipped.
The browser reads `/api/v1/oauth/authorize/context`, explicitly confirms the account
through `POST /api/v1/oauth/authorize` with a Bearer token and matching user ID, then
opens the callback. `POST /api/v1/oauth/token` returns the existing product login JWT
for this client only. Third-party clients retain opaque scoped OAuth tokens and the
existing GET authorization flow. There is no device/session management in this change.

Shared authorization codes are hashed in PostgreSQL, expire after 60 seconds for
the desktop client, and are consumed atomically after proof validation. Existing
OAuth access-token storage is unchanged. In-flight authorization codes from the
old cache need a new authorization after deployment; already-issued tokens remain
valid. The dedicated desktop-auth endpoints and scheme configuration are removed.
The public Website gateway rate-limits OAuth requests per peer IP (one request
per second with a burst of 60); standalone deployments should apply equivalent
ingress limits.

All environments register the same callback scheme. When multiple builds coexist,
the operating system chooses which application receives a callback; state/PKCE
prevent a different login attempt from accepting it but cannot choose the application.
