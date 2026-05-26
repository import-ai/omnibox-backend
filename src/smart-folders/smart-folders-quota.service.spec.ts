import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { SmartFolderOwnerScope } from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
import { SmartFoldersQuotaService } from 'omniboxd/smart-folders/smart-folders-quota.service';

describe('SmartFoldersQuotaService', () => {
  async function expectAppException(
    promise: Promise<void>,
    code: string,
  ): Promise<void> {
    await expect(promise).rejects.toMatchObject<Partial<AppException>>({
      code,
    });
  }

  function createService(values?: {
    privateLimit?: number;
    teamLimit?: number;
    ruleLimit?: number;
    activeCount?: number;
  }) {
    const entitlementsProvider = {
      getEntitlements: jest.fn().mockResolvedValue({
        tier: 'basic',
        privateLimit: values?.privateLimit ?? 2,
        teamLimit: values?.teamLimit ?? 2,
        privateUsed: 0,
        teamUsed: 0,
        ruleLimit: values?.ruleLimit ?? 3,
        trashRetentionDays: 30,
      }),
    };
    const queryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(values?.activeCount ?? 0),
    };
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const i18n = {
      t: jest.fn((key: string) => key),
    };
    const service = new SmartFoldersQuotaService(
      repository as any,
      entitlementsProvider as any,
      i18n as any,
    );

    return { entitlementsProvider, queryBuilder, service };
  }

  it('rejects create when rule count exceeds entitlement limit', async () => {
    const { service } = createService({ ruleLimit: 1 });

    await expect(
      service.assertEntitlements(
        'namespace-id',
        'user-id',
        SmartFolderOwnerScope.PRIVATE,
        2,
      ),
    ).rejects.toMatchObject<Partial<AppException>>({
      code: 'SMART_FOLDER_RULE_LIMIT_EXCEEDED',
    });
  });

  it('rejects create when active folder count reaches owner-scope quota', async () => {
    const { service } = createService({ privateLimit: 1, activeCount: 1 });

    await expectAppException(
      service.assertEntitlements(
        'namespace-id',
        'user-id',
        SmartFolderOwnerScope.PRIVATE,
        1,
      ),
      'SMART_FOLDER_QUOTA_EXCEEDED',
    );
  });

  it('rejects restore when active folder count reaches owner-scope quota', async () => {
    const { service } = createService({ teamLimit: 1, activeCount: 1 });

    await expectAppException(
      service.assertRestoreEntitlements(
        'namespace-id',
        'user-id',
        SmartFolderOwnerScope.TEAMSPACE,
      ),
      'SMART_FOLDER_QUOTA_EXCEEDED',
    );
  });
});
