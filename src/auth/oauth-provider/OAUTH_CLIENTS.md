# OAuth Clients Management via SQL

This guide explains how to manage OAuth clients directly via SQL commands.

## Database Connection

```bash
# Via Docker
docker exec omnibox-postgres-1 psql -U omnibox -d omnibox

# Or via psql directly
PGPASSWORD=omnibox psql -h localhost -p 5432 -U omnibox -d omnibox
```

## Table Schema

```sql
-- oauth_clients table
CREATE TABLE oauth_clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       VARCHAR(255) UNIQUE NOT NULL,  -- Public identifier
  client_secret   VARCHAR(255) NOT NULL,          -- Bcrypt hashed secret
  name            VARCHAR(255) NOT NULL,          -- Display name
  redirect_uris   JSONB NOT NULL DEFAULT '[]',    -- Allowed redirect URIs
  scopes          JSONB NOT NULL DEFAULT '["openid", "profile", "email"]',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
```

## Common Operations

### List All Clients

```sql
SELECT id, client_id, name, redirect_uris, scopes, is_active, created_at
FROM oauth_clients
WHERE deleted_at IS NULL;
```

### Get Client Details

```sql
SELECT * FROM oauth_clients WHERE client_id = 'flarum-forum';
```

### Create New Client

First, generate a hashed secret using Node.js:

```bash
node -e "
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const secret = crypto.randomBytes(32).toString('hex');
const hash = bcrypt.hashSync(secret, 10);
console.log('Plain Secret:', secret);
console.log('Hashed Secret:', hash);
"
```

Then insert into database:

```sql
INSERT INTO oauth_clients (client_id, client_secret, name, redirect_uris, scopes, is_active)
VALUES (
  'my-app',                                          -- client_id
  '$2b$10$XXXX...',                                  -- hashed client_secret from above
  'My Application',                                  -- display name
  '["https://myapp.com/callback"]'::jsonb,           -- redirect URIs
  '["openid", "profile", "email"]'::jsonb,           -- scopes
  true                                               -- is_active
);
```

### Update Client

```sql
-- Update name
UPDATE oauth_clients
SET name = 'New Name', updated_at = NOW()
WHERE client_id = 'my-app';

-- Update redirect URIs
UPDATE oauth_clients
SET redirect_uris = '["https://newurl.com/callback", "https://oldurl.com/callback"]'::jsonb,
    updated_at = NOW()
WHERE client_id = 'my-app';

-- Disable client
UPDATE oauth_clients
SET is_active = false, updated_at = NOW()
WHERE client_id = 'my-app';

-- Re-enable client
UPDATE oauth_clients
SET is_active = true, updated_at = NOW()
WHERE client_id = 'my-app';
```

### Regenerate Client Secret

```bash
# Generate new secret
node -e "
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const secret = crypto.randomBytes(32).toString('hex');
const hash = bcrypt.hashSync(secret, 10);
console.log('New Plain Secret:', secret);
console.log('New Hashed Secret:', hash);
"
```

```sql
UPDATE oauth_clients
SET client_secret = '$2b$10$NEW_HASH...', updated_at = NOW()
WHERE client_id = 'my-app';
```

### Delete Client (Soft Delete)

```sql
UPDATE oauth_clients
SET deleted_at = NOW()
WHERE client_id = 'my-app';
```

### Delete Client (Hard Delete)

```sql
-- First delete related tokens and codes
DELETE FROM oauth_access_tokens WHERE client_id = 'my-app';
DELETE FROM oauth_authorization_codes WHERE client_id = 'my-app';
DELETE FROM oauth_clients WHERE client_id = 'my-app';
```

## Monitoring

### View Active Access Tokens

```sql
SELECT t.id, t.client_id, t.user_id, u.username, t.scope, t.expires_at, t.created_at
FROM oauth_access_tokens t
JOIN users u ON t.user_id = u.id
WHERE t.revoked_at IS NULL AND t.expires_at > NOW()
ORDER BY t.created_at DESC;
```

### View Recent Authorization Codes

```sql
SELECT c.id, c.client_id, c.user_id, u.username, c.scope, c.expires_at, c.used_at
FROM oauth_authorization_codes c
JOIN users u ON c.user_id = u.id
ORDER BY c.created_at DESC
LIMIT 20;
```

### Revoke All Tokens for a Client

```sql
UPDATE oauth_access_tokens
SET revoked_at = NOW()
WHERE client_id = 'my-app' AND revoked_at IS NULL;
```

### Revoke All Tokens for a User

```sql
UPDATE oauth_access_tokens
SET revoked_at = NOW()
WHERE user_id = 'USER_UUID_HERE' AND revoked_at IS NULL;
```

### Cleanup Expired Records

```sql
-- Delete expired authorization codes
DELETE FROM oauth_authorization_codes WHERE expires_at < NOW();

-- Delete expired access tokens
DELETE FROM oauth_access_tokens WHERE expires_at < NOW();
```

## OAuth Endpoints

The OAuth provider exposes the following endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/oauth/authorize` | GET | Authorization endpoint - redirects user to login if needed |
| `/api/v1/oauth/token` | POST | Token endpoint - exchange auth code for access token |
| `/api/v1/oauth/userinfo` | GET | UserInfo endpoint - returns user profile |
| `/api/v1/oauth/revoke` | POST | Revoke an access token |
| `/internal/oauth/clients` | POST | Create new OAuth client (internal use only) |

### Flarum FoF Passport Configuration

Configure in Flarum Admin → Extensions → FoF Passport:

- **Authorization URL**: `https://<your-domain>/api/v1/oauth/authorize`
- **Token URL**: `https://<your-domain>/api/v1/oauth/token`
- **User Info URL**: `https://<your-domain>/api/v1/oauth/userinfo`
- **Client ID**: `flarum-forum`
- **Client Secret**: `<your-client-secret>`
- **Scopes**: `openid profile email`

## Example Client Configuration

Example configuration for a Flarum forum client:

| Field | Value |
|-------|-------|
| Client ID | `flarum-forum` |
| Name | `My Forum` |
| Redirect URIs | `["https://forum.example.com/auth/passport"]` |
| Scopes | `["openid", "profile", "email"]` |

To view:
```sql
SELECT client_id, name, redirect_uris, scopes, is_active
FROM oauth_clients
WHERE client_id = 'flarum-forum';
```
