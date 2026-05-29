import { NamespaceUsageDto } from 'omniboxd/namespaces/dto/namespace-usage.dto';
import { NamespacesQuotaController } from 'omniboxd/namespaces/namespaces-quota.controller';
import { transformKeysToSnakeCase } from 'omniboxd/interceptor/utils';

describe('NamespacesQuotaController', () => {
  it('returns namespace usage with search rule limit', async () => {
    const namespacesQuotaService = {
      getNamespaceUsage: jest.fn().mockResolvedValue({
        storageQuota: 0,
        storageUsage: 0,
        taskPriority: 1,
        taskParallelism: 1,
        fileUploadSizeLimit: 20 * 1024 * 1024,
        trashRetentionDays: 7,
        readonly: false,
        smartFolderPrivateLimit: 1,
        smartFolderTeamLimit: 1,
        smartFolderRuleLimit: 3,
        searchRuleLimit: 9,
      } as NamespaceUsageDto),
    };
    const controller = new NamespacesQuotaController(
      namespacesQuotaService as any,
    );

    const usage = await controller.getNamespaceUsage('namespace-id');

    expect(namespacesQuotaService.getNamespaceUsage).toHaveBeenCalledWith(
      'namespace-id',
    );
    expect(transformKeysToSnakeCase(usage)).toMatchObject({
      search_rule_limit: 9,
    });
  });
});
