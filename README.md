# OmniBox Backend

## Dev

### Docker

+ Watch & Debug mode

  ```shell
  docker compose -f base.yaml -f dev.yaml up -d
  ```

+ Build mode

  ```shell
  docker compose -f base.yaml -f build.yaml up -d --build
  ```

+ Run with persistence postgres and minio data

  ```shell
  docker compose ... -f persistence.yaml ...
  ```

+ Run with pgadmin

  ```shell
  docker compose ... -f pgadmin.yaml ...
  ```

Then login with:

| Name     | Value            |
|----------|------------------|
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
