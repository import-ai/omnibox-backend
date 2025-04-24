# OmniBox Backend

## Dev

### Docker

+ Watch & Debug mode

  ```shell
  docker compose -f compose.yaml -f dev.yaml up
  ```

+ Build mode

  ```shell
  docker compose -f compose.yaml -f build.yaml up --build
  ```

### locally

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
