# Cookie Authentication

This module provides cookie-based authentication functionality for protecting endpoints with JWT token cookies.

## Overview

The cookie authentication system consists of:
- **CookieAuth decorator**: Marks endpoints as requiring cookie authentication
- **CookieAuthGuard**: Guard that validates JWT tokens from cookies and sets request context

## Usage

### Basic Usage

To protect an endpoint with cookie authentication, use the `@CookieAuth()` decorator:

```typescript
import { Controller, Get } from '@nestjs/common';
import { CookieAuth } from 'omniboxd/auth/decorators';

@Controller('api/v1/protected')
export class ProtectedController {

  @Get('data')
  @CookieAuth()
  getProtectedData() {
    return { message: 'This endpoint requires cookie authentication' };
  }
}
```

### Accessing User Data

To access the user data in your controller, use the common `@UserId` decorator to get the user ID:

```typescript
import { Controller, Get } from '@nestjs/common';
import { CookieAuth } from 'omniboxd/auth/decorators';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

@Controller('api/v1/protected')
export class ProtectedController {

  @Get('user-data')
  @CookieAuth()
  getUserData(@UserId() userId: string) {
    return {
      userId: userId,
      message: 'User authenticated via cookie',
    };
  }
}
```

## Authentication Flow

The cookie authentication flow works as follows:

1. **Request**: Client sends request with `token` cookie containing a JWT
2. **Guard Check**: `CookieAuthGuard` checks if the route is decorated with `@CookieAuth()`
3. **Token Extraction**: Guard extracts the JWT token from the `token` cookie
4. **Token Validation**: Guard validates the JWT token using `AuthService.jwtVerify()`
5. **Data Extraction**: Guard extracts user information directly from the JWT payload
6. **Request Enhancement**: If successful, the guard sets the user object on the request (same structure as JWT authentication)
7. **Controller Access**: Controller methods can access user data using common decorators like `@UserId`

## User Data Structure

The cookie authentication uses the same user data structure as JWT authentication:

```typescript
interface User {
  id: string;                  // User ID from JWT token
  email?: string;              // User's email from JWT token (optional)
  username?: string;           // User's username from JWT token (optional)
  createdAt?: Date;            // Not set by cookie auth
  updatedAt?: Date;            // Not set by cookie auth
  deletedAt?: Date;            // Not set by cookie auth
}
```

## Error Handling

The `CookieAuthGuard` throws `UnauthorizedException` in the following cases:

- **Missing Token Cookie**: No `token` cookie is provided
- **Invalid Token**: JWT token is invalid or expired
- **Invalid Payload**: Token payload doesn't contain required `sub` field
- **Parameter Decorator**: `@UserId` decorator throws if no user data is available

## Integration with Other Authentication Methods

The cookie authentication system works alongside JWT and API key authentication through a multi-guard setup:

- **Routes with `@CookieAuth()`**: Use cookie authentication
- **Routes with `@APIKeyAuth()`**: Use API key authentication  
- **Routes with `@Public()`**: Skip all authentication
- **Regular routes**: Use JWT authentication (default behavior)

All guards are registered as global guards in the `AuthModule`, with each guard checking for its specific decorator.

## Cookie Requirements

The authentication expects:
- **Cookie Name**: `token`
- **Cookie Value**: Valid JWT token signed with the application's JWT secret
- **Token Format**: Standard JWT with `sub` field containing the user ID
- **Optional Fields**: JWT may contain `email` and `username` fields

## Module Structure

```
src/auth/cookie/
├── cookie.auth.decorator.ts     # @CookieAuth() decorator
├── cookie-auth.guard.ts         # Authentication guard
├── cookie-auth.guard.spec.ts    # Guard unit tests
├── index.ts                     # Module exports
└── README.md                    # This documentation
```

## Example Usage in Controllers

```typescript
import { Controller, Get, Post, Body } from '@nestjs/common';
import { CookieAuth, Public } from 'omniboxd/auth/decorators';
import { UserId } from 'omniboxd/decorators/user-id.decorator';


@Controller('api/v1/dashboard')
export class DashboardController {

  @Public()
  @Get('health')
  healthCheck() {
    return { status: 'ok' };
  }

  @CookieAuth()
  @Get('profile')
  getProfile(@UserId() userId: string) {
    return {
      userId: userId,
      message: 'User profile data',
    };
  }

  @CookieAuth()
  @Post('settings')
  updateSettings(
    @UserId() userId: string,
    @Body() settings: any,
  ) {
    // Update settings for userId
    return { success: true };
  }
}
```
