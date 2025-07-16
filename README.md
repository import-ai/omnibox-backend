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

## Tech Stack

- **Framework**: NestJS
- **Database**: PostgreSQL + TypeORM
- **Cache**: Redis
- **Object Storage**: MinIO
- **Authentication**: JWT + Passport
- **Email Service**: Nodemailer
- **Search**: Meilisearch
