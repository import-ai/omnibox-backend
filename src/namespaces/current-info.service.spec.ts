import { instanceToPlain } from 'class-transformer';
import { I18nService } from 'nestjs-i18n';
import { OpenAPIQuotaService } from 'omniboxd/open-api/open-api-quota.service';
import { UserService } from 'omniboxd/user/user.service';

import { CurrentInfoService } from './current-info.service';
import { NamespaceTier } from './dto/namespace-tier.enum';
import { NamespacesService } from './namespaces.service';
import { NamespacesQuotaService } from './namespaces-quota.service';

describe('CurrentInfoService', () => {
  const namespacesService = {
    getMemberByUserId: jest.fn(),
    getNamespace: jest.fn(),
  };
  const namespacesQuotaService = {
    getNamespaceUsage: jest.fn(),
    getNamespaceTier: jest.fn(),
  };
  const openAPIQuotaService = {
    getQuotaStatus: jest.fn(),
  };
  const userService = {
    find: jest.fn(),
  };
  const i18n = {
    t: jest.fn().mockReturnValue('Not a member'),
  };
  const service = new CurrentInfoService(
    namespacesService as unknown as NamespacesService,
    namespacesQuotaService as unknown as NamespacesQuotaService,
    openAPIQuotaService as unknown as OpenAPIQuotaService,
    userService as unknown as UserService,
    i18n as unknown as I18nService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the current identity, namespace, tier, usage and quota', async () => {
    namespacesService.getMemberByUserId.mockResolvedValue({ id: 'member-id' });
    namespacesService.getNamespace.mockResolvedValue({
      id: 'namespace-id',
      name: 'Workspace',
      maxRunningTasks: '3',
      rootResourceId: 'root-id',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    });
    userService.find.mockResolvedValue({
      id: 'user-id',
      username: 'User',
      email: 'user@example.com',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    });
    const usage = {
      storageQuota: 100,
      storageUsage: 20,
      openApiRequestsPer24h: 1000,
      readonly: false,
    };
    namespacesQuotaService.getNamespaceUsage.mockResolvedValue(usage);
    namespacesQuotaService.getNamespaceTier.mockResolvedValue(
      NamespaceTier.PREMIUM,
    );
    const quota = {
      limit: 1000,
      used: 12,
      remaining: 988,
      resetAt: null,
    };
    openAPIQuotaService.getQuotaStatus.mockResolvedValue(quota);

    const result = await service.getCurrentInfo('user-id', 'namespace-id');

    expect(result).toMatchObject({
      user: {
        id: 'user-id',
        username: 'User',
      },
      namespace: {
        id: 'namespace-id',
        name: 'Workspace',
        tier: 'premium',
      },
      namespaceUsage: usage,
      openApiRequestsQuota: quota,
    });
    expect(instanceToPlain(result)).toMatchObject({
      namespace_usage: {
        storage_quota: 100,
        storage_usage: 20,
        open_api_requests_per_24h: 1000,
        readonly: false,
      },
      open_api_requests_quota: {
        limit: 1000,
        used: 12,
        remaining: 988,
        reset_at: null,
      },
    });
    expect(openAPIQuotaService.getQuotaStatus).toHaveBeenCalledWith(
      'namespace-id',
      usage,
    );
  });

  it('rejects users outside the namespace before loading namespace data', async () => {
    namespacesService.getMemberByUserId.mockResolvedValue(null);

    await expect(
      service.getCurrentInfo('other-user-id', 'namespace-id'),
    ).rejects.toMatchObject({
      code: 'NOT_A_MEMBER',
      status: 403,
    });
    expect(userService.find).not.toHaveBeenCalled();
    expect(namespacesQuotaService.getNamespaceUsage).not.toHaveBeenCalled();
  });
});
