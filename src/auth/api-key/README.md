# API Key Authentication

This module provides API key authentication functionality for protecting endpoints with API key-based access control.

## Overview

The API key authentication system consists of:
- **APIKeyAuth decorator**: Marks endpoints as requiring API key authentication
- **APIKey decorator**: Parameter decorator to inject API key data into controller methods
- **APIKeyAuthGuard**: Guard that validates API keys and sets request context
- **APIKeyService**: Service for managing API keys in the database

## Usage

### Basic Usage

To protect an endpoint with API key authentication, use the `@APIKeyAuth()` decorator:

```typescript
import { Controller, Get } from '@nestjs/common';
import { APIKeyAuth } from 'omniboxd/auth/decorators';

@Controller('api/v1/protected')
export class ProtectedController {

  @Get('data')
  @APIKeyAuth()
  getProtectedData() {
    return { message: 'This endpoint requires API key authentication' };
  }
}
```

### Accessing API Key Data

To access the API key data in your controller, use the `@APIKey()` parameter decorator:

```typescript
import { Controller, Get } from '@nestjs/common';
import { APIKeyAuth, APIKey } from 'omniboxd/auth/decorators';
import { APIKey as APIKeyEntity } from 'omniboxd/api-key/api-key.entity';

@Controller('api/v1/protected')
export class ProtectedController {

  @Get('user-data')
  @APIKeyAuth()
  getUserData(@APIKey() apiKey: APIKeyEntity) {
    return {
      id: apiKey.id,
      userId: apiKey.userId,
      namespaceId: apiKey.namespaceId,
      attrs: apiKey.attrs,
    };
  }
}
```

## API Key Format

API keys follow the format: `sk-{40-character-hex-string}`

Example: `sk-a1b2c3d4e5f6789012345678901234567890abcd`

- **Prefix**: All API keys start with `sk-`
- **Body**: 40-character hexadecimal string (20 random bytes converted to hex)
- **Uniqueness**: Each API key value is guaranteed to be unique in the database

## Authentication Flow

1. **Request**: Client sends request with `Authorization: Bearer sk-xxxxxxxxxx` header
2. **Guard Check**: `APIKeyAuthGuard` checks if the route is decorated with `@APIKeyAuth()`
3. **Format Validation**: Guard validates the API key format (must start with `sk-`)
4. **Database Lookup**: Guard looks up the API key in the database using `APIKeyService.findByValue()`
5. **Request Enhancement**: If found, the guard sets the following on the request object:
   - `request.apiKey`: The complete API key entity
   - `request.user`: Object with `{ id: apiKey.userId }` for compatibility
6. **Controller Access**: Controller methods can access API key data using the `@APIKey()` decorator

## API Key Entity Structure

The API key entity contains the following properties:

```typescript
interface APIKey {
  id: string;              // UUID primary key
  value: string;           // The API key value (sk-...)
  userId: string;          // Associated user ID
  namespaceId: string;     // Associated namespace ID
  attrs: APIKeyAttrs;      // Additional attributes
  createdAt: Date;         // Creation timestamp
  updatedAt: Date;         // Last update timestamp
}

interface APIKeyAttrs {
  root_resource_id: string;
  permissions: Record<APIKeyPermissionTarget, APIKeyPermission[]>;
}
```

## Error Handling

The `APIKeyAuthGuard` throws `UnauthorizedException` in the following cases:

- **Missing Authorization Header**: No `Authorization` header is provided
- **Invalid Format**: API key doesn't start with `sk-`
- **Not Found**: API key is not found in the database
- **Parameter Decorator**: `@APIKey()` decorator throws if no API key data is available

## Integration with JWT Authentication

The API key authentication system works alongside JWT authentication through a dual-guard setup:

- **Routes with `@APIKeyAuth()`**: Skip JWT validation, use API key authentication
- **Routes with `@Public()`**: Skip both JWT and API key validation
- **Regular routes**: Use JWT authentication (default behavior)

Both guards are registered as global guards in the `AuthModule`, with `APIKeyAuthGuard` running after `JwtAuthGuard`.

## Module Structure

```
src/auth/api-key/
├── api-key.auth.decorator.ts    # @APIKeyAuth() decorator
├── api-key.decorator.ts         # @APIKey() parameter decorator
├── api-key-auth.guard.ts        # Authentication guard
├── api-key-auth.guard.spec.ts   # Guard unit tests
└── README.md                    # This documentation
```

The API key management functionality (CRUD operations) is located in `src/api-key/`.
