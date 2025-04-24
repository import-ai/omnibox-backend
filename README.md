# OmniBox Backend

## Dev

### Docker

+ Watch & Debug mode

  ```shell
  docker compose -f compose.yaml -f dev.yaml up -d
  ```

+ Build mode

  ```shell
  docker compose -f compose.yaml -f build.yaml up -d --build
  ```

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
