import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CookieAuthGuard } from 'omniboxd/auth/cookie/cookie-auth.guard';
import { AuthService } from 'omniboxd/auth/auth.service';

describe('CookieAuthGuard', () => {
  let guard: CookieAuthGuard;
  let reflector: jest.Mocked<Reflector>;
  let authService: jest.Mocked<AuthService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CookieAuthGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            jwtVerify: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<CookieAuthGuard>(CookieAuthGuard);
    reflector = module.get(Reflector);
    authService = module.get(AuthService);
  });

  const createMockExecutionContext = (cookies: any = {}): ExecutionContext => {
    const request = {
      cookies,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as any;
  };

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should return true for public routes', () => {
    reflector.getAllAndOverride.mockReturnValue(true); // isPublic = true
    const context = createMockExecutionContext();

    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should return true for non-cookie auth routes', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce(false); // isCookieAuth = false
    const context = createMockExecutionContext();

    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should throw UnauthorizedException when no token cookie is provided', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce(true); // isCookieAuth = true
    const context = createMockExecutionContext();

    expect(() => guard.canActivate(context)).toThrow(
      new UnauthorizedException('Authentication token cookie is required'),
    );
  });

  it('should throw UnauthorizedException when token is invalid', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce(true); // isCookieAuth = true
    const context = createMockExecutionContext({ token: 'invalid-token' });
    authService.jwtVerify.mockImplementation(() => {
      throw new Error('Invalid token');
    });

    expect(() => guard.canActivate(context)).toThrow(
      new UnauthorizedException('Invalid or expired token'),
    );
  });

  it('should throw UnauthorizedException when token payload is invalid', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce(true); // isCookieAuth = true
    const context = createMockExecutionContext({ token: 'valid-token' });
    authService.jwtVerify.mockReturnValue({}); // No sub field

    expect(() => guard.canActivate(context)).toThrow(
      new UnauthorizedException('Invalid token payload'),
    );
  });

  it('should successfully authenticate with valid token and set cookie auth data', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce(true); // isCookieAuth = true
    const context = createMockExecutionContext({ token: 'valid-token' });
    authService.jwtVerify.mockReturnValue({
      sub: 'user-123',
      namespaceId: 'namespace-123',
      email: 'test@example.com',
      username: 'testuser',
    });

    const result = guard.canActivate(context);
    const request = context.switchToHttp().getRequest();

    expect(result).toBe(true);
    expect(request.user).toEqual({
      id: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
    });
  });

  it('should handle token with missing optional fields', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce(true); // isCookieAuth = true
    const context = createMockExecutionContext({ token: 'valid-token' });
    authService.jwtVerify.mockReturnValue({
      sub: 'user-123',
      // Missing namespaceId, email, username
    });

    const result = guard.canActivate(context);
    const request = context.switchToHttp().getRequest();

    expect(result).toBe(true);
    expect(request.user).toEqual({
      id: 'user-123',
      email: undefined,
      username: undefined,
    });
  });
});
