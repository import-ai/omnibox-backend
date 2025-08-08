# Cookie Authentication

Cookie-based authentication for protecting endpoints with JWT token cookies.

## Usage

### Basic Usage

```typescript
import { Controller, Get } from '@nestjs/common';
import { CookieAuth } from 'omniboxd/auth/decorators';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

@Controller('api/v1/protected')
export class ProtectedController {
  @Get('data')
  @CookieAuth()
  getProtectedData(@UserId() userId: string) {
    return { message: 'Authenticated user', userId };
  }
}
```

### Authentication Options

```typescript
// Strict authentication (default) - throws UnauthorizedException on failure
@CookieAuth()

// Continue without authentication on failure
@CookieAuth({ onAuthFail: 'continue' })
```

## Authentication Flow

1. Client sends request with `token` cookie containing a JWT
2. `CookieAuthGuard` validates the JWT token using `AuthService.jwtVerify()`
3. User data is extracted from JWT payload and set on `request.user`
4. Controller methods access user data via `@UserId()` decorator

## Requirements

- **Cookie Name**: `token`
- **Token Format**: Valid JWT with `sub` field (user ID)
- **Optional Fields**: `email`, `username`

## Error Handling

- **Missing/Invalid Token**: Throws `UnauthorizedException` (unless `onAuthFail: 'continue'`)
- **Invalid Payload**: Throws `UnauthorizedException` if `sub` field missing

## Integration

Works alongside JWT and API key authentication:
- `@CookieAuth()`: Cookie authentication
- `@APIKeyAuth()`: API key authentication
- `@Public()`: Skip authentication
- Default: JWT authentication
