/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ForbiddenException } from '@nestjs/common';
import { APIKeyService } from './api-key.service';
import {
  APIKey,
  APIKeyPermission,
  APIKeyPermissionTarget,
} from './api-key.entity';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { CreateAPIKeyDto } from './api-key.dto';

describe('APIKeyService', () => {
  let service: APIKeyService;
  let apiKeyRepository: jest.Mocked<Repository<APIKey>>;
  let permissionsService: jest.Mocked<PermissionsService>;
  let namespacesService: jest.Mocked<NamespacesService>;

  const mockApiKey = {
    id: 'test-api-key-id',
    value: 'sk-1234567890abcdef1234567890abcdef12345678',
    userId: 'test-user-id',
    namespaceId: 'test-namespace-id',
    attrs: {
      root_resource_id: 'test-resource-id',
      permissions: {
        [APIKeyPermissionTarget.RESOURCES]: [APIKeyPermission.READ],
      },
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
    };

    const mockPermissionsService = {
      userHasPermission: jest.fn(),
    };

    const mockNamespacesService = {
      getMemberByUserId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        APIKeyService,
        {
          provide: getRepositoryToken(APIKey),
          useValue: mockRepository,
        },
        {
          provide: PermissionsService,
          useValue: mockPermissionsService,
        },
        {
          provide: NamespacesService,
          useValue: mockNamespacesService,
        },
      ],
    }).compile();

    service = module.get<APIKeyService>(APIKeyService);
    apiKeyRepository = module.get(getRepositoryToken(APIKey));
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
        permissions: {
          [APIKeyPermissionTarget.RESOURCES]: [APIKeyPermission.READ],
        },
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

    it('should throw ForbiddenException when user is not a namespace member', async () => {
      // Mock namespace membership check to return null (not a member)
      namespacesService.getMemberByUserId.mockResolvedValue(null);

      await expect(service.create(createApiKeyDto)).rejects.toThrow(
        ForbiddenException,
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

    it('should throw ForbiddenException when user lacks write permission to resource', async () => {
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
        ForbiddenException,
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
          permissions: {
            [APIKeyPermissionTarget.RESOURCES]: [APIKeyPermission.READ],
          },
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
});
