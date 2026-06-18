/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { Applications } from 'omniboxd/applications/applications.entity';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { NamespacesQuotaService } from 'omniboxd/namespaces/namespaces-quota.service';
import { OpenAPIQuotaService } from 'omniboxd/open-api/open-api-quota.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { UserService } from 'omniboxd/user/user.service';
import { Repository } from 'typeorm';

import { CreateAPIKeyDto } from './api-key.dto';
import {
  APIKey,
  APIKeyPermissionTarget,
  APIKeyPermissionType,
} from './api-key.entity';
import { APIKeyService } from './api-key.service';

describe('APIKeyService', () => {
  let service: APIKeyService;
  let apiKeyRepository: jest.Mocked<Repository<APIKey>>;
  let applicationsRepository: jest.Mocked<Repository<Applications>>;
  let permissionsService: jest.Mocked<PermissionsService>;
  let namespacesService: jest.Mocked<NamespacesService>;

  const mockApiKey = {
    id: 'test-api-key-id',
    value: 'sk-1234567890abcdef1234567890abcdef12345678',
    userId: 'test-user-id',
    namespaceId: 'test-namespace-id',
    attrs: {
      root_resource_id: 'test-resource-id',
      permissions: [
        {
          target: APIKeyPermissionTarget.RESOURCES,
          permissions: [APIKeyPermissionType.READ],
        },
      ],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      softDelete: jest.fn(),
    };

    const mockApplicationsRepository = {
      softDelete: jest.fn(),
    };

    const mockPermissionsService = {
      userHasPermission: jest.fn(),
    };

    const mockNamespacesService = {
      getMemberByUserId: jest.fn(),
    };

    const mockUserService = {
      find: jest.fn(),
    };

    const mockI18nService = {
      t: jest.fn((key: string, options?: any) => {
        // Return mock translations for test purposes
        const translations: Record<string, string> = {
          'apikey.errors.noPermissionForNamespace':
            'User {{userId}} does not have permission to namespace {{namespaceId}}',
          'apikey.errors.noWritePermission':
            'User {{userId}} does not have write permission to resource {{resourceId}} in namespace {{namespaceId}}',
          'apikey.errors.invalidPermissionTarget':
            'Invalid API key permission target: {{target}}',
          'apikey.errors.invalidPermissionAction':
            'Invalid API key permission action: {{action}} for target: {{target}}',
          'apikey.errors.invalidPermissionCombination':
            'API key permission action {{action}} is not allowed for target: {{target}}',
          'apikey.errors.noteTooLong':
            'API key note cannot exceed {{max}} characters',
        };
        let translation = translations[key] || key;
        if (options?.args) {
          Object.entries(options.args).forEach(([param, value]) => {
            translation = translation.replace(`{{${param}}}`, String(value));
          });
        }
        return translation;
      }),
    };

    const mockNamespacesQuotaService = {
      getNamespaceUsage: jest.fn(),
      isNamespaceReadonly: jest.fn().mockResolvedValue(false),
    };

    const mockOpenAPIQuotaService = {
      getQuotaStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        APIKeyService,
        {
          provide: getRepositoryToken(APIKey),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(Applications),
          useValue: mockApplicationsRepository,
        },
        {
          provide: PermissionsService,
          useValue: mockPermissionsService,
        },
        {
          provide: NamespacesService,
          useValue: mockNamespacesService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: I18nService,
          useValue: mockI18nService,
        },
        {
          provide: NamespacesQuotaService,
          useValue: mockNamespacesQuotaService,
        },
        {
          provide: OpenAPIQuotaService,
          useValue: mockOpenAPIQuotaService,
        },
      ],
    }).compile();

    service = module.get<APIKeyService>(APIKeyService);
    apiKeyRepository = module.get(getRepositoryToken(APIKey));
    applicationsRepository = module.get(getRepositoryToken(Applications));
    permissionsService = module.get(PermissionsService);
    namespacesService = module.get(NamespacesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createApiKeyDto: CreateAPIKeyDto = {
      user_id: 'test-user-id',
      namespace_id: 'test-namespace-id',
      attrs: {
        root_resource_id: 'test-resource-id',
        permissions: [
          {
            target: APIKeyPermissionTarget.RESOURCES,
            permissions: [APIKeyPermissionType.READ],
          },
        ],
      },
    };

    it('should create an API key when user has namespace permission', async () => {
      // Mock namespace membership check
      namespacesService.getMemberByUserId.mockResolvedValue({
        id: 1,
        namespaceId: 'test-namespace-id',
        userId: 'test-user-id',
        role: 'member',
        rootResourceId: 'test-root-resource-id',
      } as any);

      // Mock resource permission check
      permissionsService.userHasPermission.mockResolvedValue(true);

      // Mock repository methods
      apiKeyRepository.findOne.mockResolvedValue(null); // For uniqueness check
      apiKeyRepository.create.mockReturnValue(mockApiKey as any);
      apiKeyRepository.save.mockResolvedValue(mockApiKey as any);

      const result = await service.create(createApiKeyDto);

      expect(namespacesService.getMemberByUserId).toHaveBeenCalledWith(
        'test-namespace-id',
        'test-user-id',
      );
      expect(permissionsService.userHasPermission).toHaveBeenCalledWith(
        'test-namespace-id',
        'test-resource-id',
        'test-user-id',
        ResourcePermission.CAN_EDIT,
      );
      expect(apiKeyRepository.create).toHaveBeenCalled();
      expect(apiKeyRepository.save).toHaveBeenCalled();
      expect(result).toMatchObject({
        id: mockApiKey.id,
        value: mockApiKey.value,
        user_id: mockApiKey.userId,
        namespace_id: mockApiKey.namespaceId,
        attrs: mockApiKey.attrs,
      });
    });

    it('should throw AppException when user is not a namespace member', async () => {
      // Mock namespace membership check to return null (not a member)
      namespacesService.getMemberByUserId.mockResolvedValue(null);

      await expect(service.create(createApiKeyDto)).rejects.toThrow(
        AppException,
      );
      await expect(service.create(createApiKeyDto)).rejects.toThrow(
        'User test-user-id does not have permission to namespace test-namespace-id',
      );

      expect(namespacesService.getMemberByUserId).toHaveBeenCalledWith(
        'test-namespace-id',
        'test-user-id',
      );
      // Should not check resource permissions if namespace check fails
      expect(permissionsService.userHasPermission).not.toHaveBeenCalled();
      expect(apiKeyRepository.create).not.toHaveBeenCalled();
    });

    it('should throw AppException when user lacks write permission to resource', async () => {
      // Mock namespace membership check
      namespacesService.getMemberByUserId.mockResolvedValue({
        id: 1,
        namespaceId: 'test-namespace-id',
        userId: 'test-user-id',
        role: 'member',
        rootResourceId: 'test-root-resource-id',
      } as any);

      // Mock resource permission check to return false
      permissionsService.userHasPermission.mockResolvedValue(false);

      await expect(service.create(createApiKeyDto)).rejects.toThrow(
        AppException,
      );
      await expect(service.create(createApiKeyDto)).rejects.toThrow(
        'User test-user-id does not have write permission to resource test-resource-id in namespace test-namespace-id',
      );

      expect(namespacesService.getMemberByUserId).toHaveBeenCalledWith(
        'test-namespace-id',
        'test-user-id',
      );
      expect(permissionsService.userHasPermission).toHaveBeenCalledWith(
        'test-namespace-id',
        'test-resource-id',
        'test-user-id',
        ResourcePermission.CAN_EDIT,
      );
      expect(apiKeyRepository.create).not.toHaveBeenCalled();
    });

    it('should create API key without resource validation when attrs.root_resource_id is not provided', async () => {
      const createApiKeyDtoWithoutResource: CreateAPIKeyDto = {
        user_id: 'test-user-id',
        namespace_id: 'test-namespace-id',
        attrs: {
          permissions: [
            {
              target: APIKeyPermissionTarget.RESOURCES,
              permissions: [APIKeyPermissionType.READ],
            },
          ],
        } as any,
      };

      // Mock namespace membership check
      namespacesService.getMemberByUserId.mockResolvedValue({
        id: 1,
        namespaceId: 'test-namespace-id',
        userId: 'test-user-id',
        role: 'member',
        rootResourceId: 'test-root-resource-id',
      } as any);

      // Mock repository methods
      apiKeyRepository.findOne.mockResolvedValue(null); // For uniqueness check
      apiKeyRepository.create.mockReturnValue(mockApiKey as any);
      apiKeyRepository.save.mockResolvedValue(mockApiKey as any);

      const result = await service.create(createApiKeyDtoWithoutResource);

      expect(namespacesService.getMemberByUserId).toHaveBeenCalledWith(
        'test-namespace-id',
        'test-user-id',
      );
      // Should not check resource permissions when root_resource_id is not provided
      expect(permissionsService.userHasPermission).not.toHaveBeenCalled();
      expect(apiKeyRepository.create).toHaveBeenCalled();
      expect(apiKeyRepository.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should allow tags and search permissions', async () => {
      const createApiKeyDtoWithOpenPermissions: CreateAPIKeyDto = {
        user_id: 'test-user-id',
        namespace_id: 'test-namespace-id',
        attrs: {
          root_resource_id: 'test-resource-id',
          permissions: [
            {
              target: APIKeyPermissionTarget.TAGS,
              permissions: [
                APIKeyPermissionType.CREATE,
                APIKeyPermissionType.READ,
              ],
            },
            {
              target: APIKeyPermissionTarget.SEARCH,
              permissions: [APIKeyPermissionType.READ],
            },
          ],
        },
      };

      namespacesService.getMemberByUserId.mockResolvedValue({
        id: 1,
        namespaceId: 'test-namespace-id',
        userId: 'test-user-id',
        role: 'member',
        rootResourceId: 'test-root-resource-id',
      } as any);
      permissionsService.userHasPermission.mockResolvedValue(true);
      apiKeyRepository.findOne.mockResolvedValue(null);
      apiKeyRepository.create.mockReturnValue({
        ...mockApiKey,
        attrs: createApiKeyDtoWithOpenPermissions.attrs,
      } as any);
      apiKeyRepository.save.mockResolvedValue({
        ...mockApiKey,
        attrs: createApiKeyDtoWithOpenPermissions.attrs,
      } as any);

      const result = await service.create(createApiKeyDtoWithOpenPermissions);

      expect(result.attrs.permissions).toEqual(
        createApiKeyDtoWithOpenPermissions.attrs!.permissions,
      );
    });

    it('should reject unknown permission targets', async () => {
      const createApiKeyDtoWithInvalidTarget: CreateAPIKeyDto = {
        user_id: 'test-user-id',
        namespace_id: 'test-namespace-id',
        attrs: {
          root_resource_id: 'test-resource-id',
          permissions: [
            {
              target: 'vfs' as APIKeyPermissionTarget,
              permissions: [APIKeyPermissionType.READ],
            },
          ],
        },
      };

      await expect(
        service.create(createApiKeyDtoWithInvalidTarget),
      ).rejects.toThrow('Invalid API key permission target: vfs');

      expect(namespacesService.getMemberByUserId).not.toHaveBeenCalled();
      expect(apiKeyRepository.create).not.toHaveBeenCalled();
    });

    it('should reject illegal target-action combinations', async () => {
      const createApiKeyDtoWithInvalidCombination: CreateAPIKeyDto = {
        user_id: 'test-user-id',
        namespace_id: 'test-namespace-id',
        attrs: {
          root_resource_id: 'test-resource-id',
          permissions: [
            {
              target: APIKeyPermissionTarget.SEARCH,
              permissions: [APIKeyPermissionType.CREATE],
            },
          ],
        },
      };

      await expect(
        service.create(createApiKeyDtoWithInvalidCombination),
      ).rejects.toThrow(
        'API key permission action create is not allowed for target: search',
      );

      expect(namespacesService.getMemberByUserId).not.toHaveBeenCalled();
      expect(apiKeyRepository.create).not.toHaveBeenCalled();
    });

    it('should reject create with notes longer than 128 characters', async () => {
      await expect(
        service.create({
          user_id: 'test-user-id',
          namespace_id: 'test-namespace-id',
          attrs: {
            note: 'a'.repeat(129),
            root_resource_id: 'test-resource-id',
            permissions: [
              {
                target: APIKeyPermissionTarget.RESOURCES,
                permissions: [APIKeyPermissionType.READ],
              },
            ],
          },
        }),
      ).rejects.toThrow('API key note cannot exceed 128 characters');

      expect(namespacesService.getMemberByUserId).not.toHaveBeenCalled();
      expect(apiKeyRepository.create).not.toHaveBeenCalled();
    });

    it('should reject create with non-string notes', async () => {
      await expect(
        service.create({
          user_id: 'test-user-id',
          namespace_id: 'test-namespace-id',
          attrs: {
            note: 123,
            root_resource_id: 'test-resource-id',
            permissions: [
              {
                target: APIKeyPermissionTarget.RESOURCES,
                permissions: [APIKeyPermissionType.READ],
              },
            ],
          } as any,
        }),
      ).rejects.toThrow('validation.errors.isString');

      expect(namespacesService.getMemberByUserId).not.toHaveBeenCalled();
      expect(apiKeyRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findByValue', () => {
    it('should find an API key by its value', async () => {
      apiKeyRepository.findOne.mockResolvedValue(mockApiKey as any);

      const result = await service.findByValue(
        'sk-1234567890abcdef1234567890abcdef12345678',
      );

      expect(result).toEqual(mockApiKey);
      expect(apiKeyRepository.findOne).toHaveBeenCalledWith({
        where: { value: 'sk-1234567890abcdef1234567890abcdef12345678' },
      });
    });

    it('should return null when API key is not found', async () => {
      apiKeyRepository.findOne.mockResolvedValue(null);

      const result = await service.findByValue('sk-nonexistent');

      expect(result).toBeNull();
      expect(apiKeyRepository.findOne).toHaveBeenCalledWith({
        where: { value: 'sk-nonexistent' },
      });
    });
  });

  describe('patch', () => {
    it('should patch note while preserving existing attrs', async () => {
      apiKeyRepository.update.mockResolvedValue({ affected: 1 } as any);

      const patchedApiKey = {
        ...mockApiKey,
        attrs: {
          ...mockApiKey.attrs,
          note: 'Production sync key',
        },
      };
      apiKeyRepository.findOne
        .mockResolvedValueOnce(mockApiKey as any)
        .mockResolvedValueOnce(patchedApiKey as any);

      const result = await service.patch('test-api-key-id', {
        note: 'Production sync key',
      });

      expect(apiKeyRepository.update).toHaveBeenCalledWith('test-api-key-id', {
        attrs: patchedApiKey.attrs,
      });
      expect(result.attrs.note).toBe('Production sync key');
    });

    it('should reject notes longer than 128 characters', async () => {
      apiKeyRepository.findOne.mockResolvedValue(mockApiKey as any);

      await expect(
        service.patch('test-api-key-id', {
          note: 'a'.repeat(129),
        }),
      ).rejects.toThrow('API key note cannot exceed 128 characters');

      expect(apiKeyRepository.update).not.toHaveBeenCalled();
    });

    it('should reject illegal permissions while preserving existing attrs', async () => {
      apiKeyRepository.findOne.mockResolvedValue(mockApiKey as any);

      await expect(
        service.patch('test-api-key-id', {
          permissions: [
            {
              target: APIKeyPermissionTarget.TAGS,
              permissions: [APIKeyPermissionType.DELETE],
            },
          ],
        }),
      ).rejects.toThrow(
        'API key permission action delete is not allowed for target: tags',
      );

      expect(apiKeyRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('generateUniqueApiKeyValue', () => {
    it('should generate a unique API key value with sk- prefix', async () => {
      // Mock findOne to return null (value is unique)
      apiKeyRepository.findOne.mockResolvedValue(null);

      // Access the private method using bracket notation for testing
      const value = await (service as any).generateUniqueApiKeyValue();

      expect(value).toMatch(/^sk-[a-f0-9]{40}$/);
      expect(apiKeyRepository.findOne).toHaveBeenCalledWith({
        where: { value },
      });
    });

    it('should retry generation if value already exists', async () => {
      // Mock findOne to return an existing API key first, then null
      apiKeyRepository.findOne
        .mockResolvedValueOnce(mockApiKey as any) // First call returns existing
        .mockResolvedValueOnce(null); // Second call returns null (unique)

      const value = await (service as any).generateUniqueApiKeyValue();

      expect(value).toMatch(/^sk-[a-f0-9]{40}$/);
      expect(apiKeyRepository.findOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('delete', () => {
    it('should delete API key and cascade delete related applications', async () => {
      const apiKeyId = 'test-api-key-id';

      // Mock successful soft delete operations
      applicationsRepository.softDelete.mockResolvedValue({
        affected: 2,
      } as any);
      apiKeyRepository.softDelete.mockResolvedValue({ affected: 1 } as any);

      await service.delete(apiKeyId);

      // Verify applications were deleted first
      expect(applicationsRepository.softDelete).toHaveBeenCalledWith({
        apiKeyId: apiKeyId,
      });

      // Verify API key was deleted after
      expect(apiKeyRepository.softDelete).toHaveBeenCalledWith(apiKeyId);
    });

    it('should delete API key and handle when no related applications exist', async () => {
      const apiKeyId = 'test-api-key-id';

      // Mock soft delete operations (0 applications affected, 1 API key affected)
      applicationsRepository.softDelete.mockResolvedValue({
        affected: 0,
      } as any);
      apiKeyRepository.softDelete.mockResolvedValue({ affected: 1 } as any);

      await service.delete(apiKeyId);

      // Verify applications soft delete was still called (even if no applications found)
      expect(applicationsRepository.softDelete).toHaveBeenCalledWith({
        apiKeyId: apiKeyId,
      });

      // Verify API key was deleted
      expect(apiKeyRepository.softDelete).toHaveBeenCalledWith(apiKeyId);
    });
  });
});
