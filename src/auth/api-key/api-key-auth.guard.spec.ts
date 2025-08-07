import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { APIKeyAuthGuard } from 'omniboxd/auth';
import { APIKeyService } from 'omniboxd/api-key/api-key.service';
import {
  APIKey,
  APIKeyPermission,
  APIKeyPermissionTarget,
} from 'omniboxd/api-key/api-key.entity';

describe('APIKeyAuthGuard', () => {
  let guard: APIKeyAuthGuard;
  let apiKeyService: jest.Mocked<APIKeyService>;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        APIKeyAuthGuard,
        {
          provide: APIKeyService,
          useValue: {
            findByValue: jest.fn(),
          },
        },
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<APIKeyAuthGuard>(APIKeyAuthGuard);
    apiKeyService = module.get(APIKeyService);
    reflector = module.get(Reflector);
  });

  const createMockExecutionContext = (
    authHeader?: string,
  ): ExecutionContext => {
    const request = {
      headers: {
        authorization: authHeader,
      },
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

  it('should allow public routes', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(true); // isPublic = true
    const context = createMockExecutionContext();

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should allow non-API key routes', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce(false); // isApiKeyAuth = false
    const context = createMockExecutionContext();

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should throw UnauthorizedException when no authorization header', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce(true); // isApiKeyAuth = true
    const context = createMockExecutionContext();

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException when API key does not start with sk-', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce(true); // isApiKeyAuth = true
    const context = createMockExecutionContext('Bearer invalid-key');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException when API key is not found', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce(true); // isApiKeyAuth = true
    const context = createMockExecutionContext('Bearer sk-validformat');
    apiKeyService.findByValue.mockResolvedValue(null);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should allow valid API key and set apiKey and user on request', async () => {
    const mockApiKey: APIKey = {
      id: 'test-id',
      value: 'sk-validkey',
      userId: 'user-123',
      namespaceId: 'namespace-456',
      attrs: {
        root_resource_id: 'resource-789',
        permissions: {
          [APIKeyPermissionTarget.RESOURCES]: [APIKeyPermission.READ],
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce(true); // isApiKeyAuth = true
    const context = createMockExecutionContext('Bearer sk-validkey');
    apiKeyService.findByValue.mockResolvedValue(mockApiKey);

    const result = await guard.canActivate(context);
    const request = context.switchToHttp().getRequest();

    expect(result).toBe(true);
    expect(request.apiKey).toEqual(mockApiKey);
    expect(request.user).toEqual({ id: 'user-123' });
  });
});
