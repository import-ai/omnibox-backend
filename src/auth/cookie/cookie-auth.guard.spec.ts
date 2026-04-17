import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CookieAuthGuard } from 'omniboxd/auth/cookie/cookie-auth.guard';
import { AuthService } from 'omniboxd/auth/auth.service';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { User } from 'omniboxd/user/entities/user.entity';

describe('CookieAuthGuard', () => {
  let guard: CookieAuthGuard;
  let reflector: jest.Mocked<Reflector>;
  let authService: jest.Mocked<AuthService>;
  let userRepository: jest.Mocked<any>;

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
        {
          provide: I18nService,
          useValue: {
            t: jest.fn((key: string) => {
              // Return mock translations for test purposes
              const translations: Record<string, string> = {
                'auth.errors.tokenCookieRequired':
                  'Authentication token cookie is required',
                'auth.errors.invalidTokenPayload': 'Invalid token payload',
                'auth.errors.invalidToken': 'Invalid token',
                'auth.errors.tokenExpired': 'Token expired',
              };
              return translations[key] || key;
            }),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<CookieAuthGuard>(CookieAuthGuard);
    reflector = module.get(Reflector);
    authService = module.get(AuthService);
    userRepository = module.get(getRepositoryToken(User));
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

  it('should return true for public routes', async () => {
    reflector.getAllAndOverride.mockReturnValue(true); // isPublic = true
    const context = createMockExecutionContext();

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should return true for non-cookie auth routes', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce(null); // cookieAuthOptions = null
    const context = createMockExecutionContext();

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should throw AppException when no token cookie is provided', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce({ enabled: true }); // cookieAuthOptions with default onAuthFail = 'reject'
    const context = createMockExecutionContext();

    await expect(guard.canActivate(context)).rejects.toThrow(AppException);
  });

  it('should throw AppException when token is invalid', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce({ enabled: true }); // cookieAuthOptions with default onAuthFail = 'reject'
    const context = createMockExecutionContext({ token: 'invalid-token' });
    authService.jwtVerify.mockImplementation(() => {
      throw new Error('Invalid token');
    });

    await expect(guard.canActivate(context)).rejects.toThrow(AppException);
  });

  it('should throw AppException when token payload is invalid', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce({ enabled: true }); // cookieAuthOptions with default onAuthFail = 'reject'
    const context = createMockExecutionContext({ token: 'valid-token' });
    authService.jwtVerify.mockReturnValue({}); // No sub field

    await expect(guard.canActivate(context)).rejects.toThrow(AppException);
  });

  it('should successfully authenticate with valid token and set cookie auth data', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce({ enabled: true }); // cookieAuthOptions with default onAuthFail = 'reject'
    const context = createMockExecutionContext({ token: 'valid-token' });
    authService.jwtVerify.mockReturnValue({
      sub: 'user-123',
      namespaceId: 'namespace-123',
      email: 'test@example.com',
      username: 'testuser',
    });
    userRepository.findOne.mockResolvedValue({ id: 'user-123' });

    const result = await guard.canActivate(context);
    const request = context.switchToHttp().getRequest();

    expect(result).toBe(true);
    expect(request.user).toEqual({
      id: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
    });
  });

  it('should handle token with missing optional fields', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce({ enabled: true }); // cookieAuthOptions with default onAuthFail = 'reject'
    const context = createMockExecutionContext({ token: 'valid-token' });
    authService.jwtVerify.mockReturnValue({
      sub: 'user-123',
      // Missing namespaceId, email, username
    });
    userRepository.findOne.mockResolvedValue({ id: 'user-123' });

    const result = await guard.canActivate(context);
    const request = context.switchToHttp().getRequest();

    expect(result).toBe(true);
    expect(request.user).toEqual({
      id: 'user-123',
      email: undefined,
      username: undefined,
    });
  });

  it('should continue without authentication when onAuthFail is continue and no token', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce({ enabled: true, onAuthFail: 'continue' }); // cookieAuthOptions with onAuthFail = 'continue'
    const context = createMockExecutionContext();

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should continue without authentication when onAuthFail is continue and token is invalid', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce({ enabled: true, onAuthFail: 'continue' }); // cookieAuthOptions with onAuthFail = 'continue'
    const context = createMockExecutionContext({ token: 'invalid-token' });
    authService.jwtVerify.mockImplementation(() => {
      throw new Error('Invalid token');
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should continue without authentication when onAuthFail is continue and token payload is invalid', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce({ enabled: true, onAuthFail: 'continue' }); // cookieAuthOptions with onAuthFail = 'continue'
    const context = createMockExecutionContext({ token: 'valid-token' });
    authService.jwtVerify.mockReturnValue({}); // No sub field

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should throw AppException when user does not exist in database', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce({ enabled: true }); // cookieAuthOptions with default onAuthFail = 'reject'
    const context = createMockExecutionContext({ token: 'valid-token' });
    authService.jwtVerify.mockReturnValue({
      sub: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
    });
    userRepository.findOne.mockResolvedValue(null); // User not found

    await expect(guard.canActivate(context)).rejects.toThrow(AppException);
  });

  it('should continue without authentication when onAuthFail is continue and user does not exist', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce({ enabled: true, onAuthFail: 'continue' }); // cookieAuthOptions with onAuthFail = 'continue'
    const context = createMockExecutionContext({ token: 'valid-token' });
    authService.jwtVerify.mockReturnValue({
      sub: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
    });
    userRepository.findOne.mockResolvedValue(null); // User not found

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });
});
