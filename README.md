# OmniBox Backend

## Project Introduction

OmniBox Backend is a backend service developed based on the NestJS framework, providing user authentication, file management, conversation management, and other functionalities.

## Main Features

### User Authentication System

- **Email Password Login**: Traditional email and password authentication
- **WeChat Login**: Supports WeChat login in multiple scenarios
  - PC End: QR code scanning login
  - Mobile Web: Redirect to WeChat authorization
  - WeChat Browser: Direct popup authentication dialog

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

## WeChat Login Feature

### Feature Highlights

1. **PC End Login**: Generate QR code for users to scan and complete login
2. **Mobile Web End**: Automatically redirect to WeChat for authorization
3. **WeChat Browser**: Direct popup WeChat authorization dialog

### Usage

1. Get login QR code: `GET /auth/wechat/qrcode`
2. Check login status: `GET /auth/wechat/check/:state`
3. WeChat authorization callback: `GET /auth/wechat/callback`

### Configuration Requirements

Need to configure WeChat-related parameters in environment variables:

- `WECHAT_APP_ID`: WeChat application ID
- `WECHAT_APP_SECRET`: WeChat application secret
- `WECHAT_REDIRECT_URI`: Authorization callback address

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

## Tech Stack

- **Framework**: NestJS
- **Database**: PostgreSQL + TypeORM
- **Cache**: Redis
- **Object Storage**: MinIO
- **Authentication**: JWT + Passport
- **Email Service**: Nodemailer
- **Search**: Meilisearch

## Project Structure

```
src/
├── auth/           # Authentication related modules
├── user/           # User management
├── conversations/  # Conversation management
├── resources/      # Resource management
├── namespaces/     # Namespace management
├── groups/         # User group management
├── permissions/    # Permission management
├── mail/           # Email service
└── wizard/         # AI assistant functionality
```
