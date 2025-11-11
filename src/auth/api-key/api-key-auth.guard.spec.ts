import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { APIKeyAuthGuard } from 'omniboxd/auth';
import { APIKeyService } from 'omniboxd/api-key/api-key.service';
import {
  APIKey,
  APIKeyPermissionType,
  APIKeyPermissionTarget,
  APIKeyPermission,
} from 'omniboxd/api-key/api-key.entity';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';

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
        {
          provide: I18nService,
          useValue: {
            t: jest.fn((key: string) => {
              // Return mock translations for test purposes
              const translations: Record<string, string> = {
                'apikey.errors.authorizationHeaderRequired':
                  'Authorization header is required',
                'apikey.errors.invalidApiKeyFormat': 'Invalid API key format',
                'apikey.errors.invalidApiKey': 'Invalid API key',
                'apikey.errors.noPermissionForTarget':
                  'No permission for target {{target}}',
                'apikey.errors.noSpecificPermission':
                  'No {{permission}} permission for target {{target}}',
              };
              return translations[key] || key;
            }),
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
      .mockReturnValueOnce(undefined); // apiKeyAuthOptions = undefined
    const context = createMockExecutionContext();

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should throw AppException when no authorization header', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce({ enabled: true }); // apiKeyAuthOptions = { enabled: true }
    const context = createMockExecutionContext();

    await expect(guard.canActivate(context)).rejects.toThrow(AppException);
  });

  it('should throw AppException when API key does not start with sk-', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce({ enabled: true }); // apiKeyAuthOptions = { enabled: true }
    const context = createMockExecutionContext('Bearer invalid-key');

    await expect(guard.canActivate(context)).rejects.toThrow(AppException);
  });

  it('should throw AppException when API key is not found', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce({ enabled: true }); // apiKeyAuthOptions = { enabled: true }
    const context = createMockExecutionContext('Bearer sk-validformat');
    apiKeyService.findByValue.mockResolvedValue(null);

    await expect(guard.canActivate(context)).rejects.toThrow(AppException);
  });

  it('should allow valid API key and set apiKey and user on request', async () => {
    const mockApiKey: APIKey = {
      id: 'test-id',
      value: 'sk-validkey',
      userId: 'user-123',
      namespaceId: 'namespace-456',
      attrs: {
        root_resource_id: 'resource-789',
        permissions: [
          {
            target: APIKeyPermissionTarget.RESOURCES,
            permissions: [APIKeyPermissionType.READ],
          },
        ],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce({ enabled: true }); // apiKeyAuthOptions = { enabled: true }
    const context = createMockExecutionContext('Bearer sk-validkey');
    apiKeyService.findByValue.mockResolvedValue(mockApiKey);

    const result = await guard.canActivate(context);
    const request = context.switchToHttp().getRequest();

    expect(result).toBe(true);
    expect(request.apiKey).toEqual(mockApiKey);
    expect(request.user).toEqual({ id: 'user-123' });
  });

  it('should allow API key with matching permissions', async () => {
    const mockApiKey: APIKey = {
      id: 'test-id',
      value: 'sk-validkey',
      userId: 'user-123',
      namespaceId: 'namespace-456',
      attrs: {
        root_resource_id: 'resource-789',
        permissions: [
          {
            target: APIKeyPermissionTarget.RESOURCES,
            permissions: [
              APIKeyPermissionType.CREATE,
              APIKeyPermissionType.READ,
            ],
          },
        ],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    const requiredPermissions: APIKeyPermission[] = [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.CREATE],
      },
    ];

    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce({ enabled: true, permissions: requiredPermissions }); // apiKeyAuthOptions
    const context = createMockExecutionContext('Bearer sk-validkey');
    apiKeyService.findByValue.mockResolvedValue(mockApiKey);

    const result = await guard.canActivate(context);
    const request = context.switchToHttp().getRequest();

    expect(result).toBe(true);
    expect(request.apiKey).toEqual(mockApiKey);
    expect(request.user).toEqual({ id: 'user-123' });
  });

  it('should throw AppException when API key lacks required target permission', async () => {
    const mockApiKey: APIKey = {
      id: 'test-id',
      value: 'sk-validkey',
      userId: 'user-123',
      namespaceId: 'namespace-456',
      attrs: {
        root_resource_id: 'resource-789',
        permissions: [], // No permissions
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    const requiredPermissions: APIKeyPermission[] = [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.CREATE],
      },
    ];

    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce({ enabled: true, permissions: requiredPermissions }); // apiKeyAuthOptions
    const context = createMockExecutionContext('Bearer sk-validkey');
    apiKeyService.findByValue.mockResolvedValue(mockApiKey);

    await expect(guard.canActivate(context)).rejects.toThrow(AppException);
  });

  it('should throw AppException when API key lacks specific permission type', async () => {
    const mockApiKey: APIKey = {
      id: 'test-id',
      value: 'sk-validkey',
      userId: 'user-123',
      namespaceId: 'namespace-456',
      attrs: {
        root_resource_id: 'resource-789',
        permissions: [
          {
            target: APIKeyPermissionTarget.RESOURCES,
            permissions: [APIKeyPermissionType.READ], // Only READ, not CREATE
          },
        ],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    const requiredPermissions: APIKeyPermission[] = [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.CREATE],
      },
    ];

    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce({ enabled: true, permissions: requiredPermissions }); // apiKeyAuthOptions
    const context = createMockExecutionContext('Bearer sk-validkey');
    apiKeyService.findByValue.mockResolvedValue(mockApiKey);

    await expect(guard.canActivate(context)).rejects.toThrow(AppException);
  });

  it('should allow API key with multiple matching permissions', async () => {
    const mockApiKey: APIKey = {
      id: 'test-id',
      value: 'sk-validkey',
      userId: 'user-123',
      namespaceId: 'namespace-456',
      attrs: {
        root_resource_id: 'resource-789',
        permissions: [
          {
            target: APIKeyPermissionTarget.RESOURCES,
            permissions: [
              APIKeyPermissionType.CREATE,
              APIKeyPermissionType.READ,
              APIKeyPermissionType.UPDATE,
              APIKeyPermissionType.DELETE,
            ],
          },
        ],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    const requiredPermissions: APIKeyPermission[] = [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.CREATE, APIKeyPermissionType.UPDATE],
      },
    ];

    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic = false
      .mockReturnValueOnce({ enabled: true, permissions: requiredPermissions }); // apiKeyAuthOptions
    const context = createMockExecutionContext('Bearer sk-validkey');
    apiKeyService.findByValue.mockResolvedValue(mockApiKey);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });
});
