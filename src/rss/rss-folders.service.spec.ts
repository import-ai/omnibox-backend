import { RssFolderInitialSyncStatus } from 'omniboxd/rss/dto/rss-folder-response.dto';
import { RssFoldersService } from 'omniboxd/rss/rss-folders.service';

describe('RssFoldersService initial sync status', () => {
  const query = jest.fn();
  const service = Object.create(RssFoldersService.prototype) as {
    rssPollRepository: { query: jest.Mock };
    getInitialSyncStatus(
      namespaceId: string,
      resourceId: string,
    ): Promise<RssFolderInitialSyncStatus>;
  };
  service.rssPollRepository = { query };

  beforeEach(() => {
    query.mockReset();
  });

  it.each([
    [[], RssFolderInitialSyncStatus.SUCCEEDED],
    [
      [
        {
          isSynced: false,
          hasPolling: false,
          hasFailed: false,
          pollCount: 0,
        },
      ],
      RssFolderInitialSyncStatus.PENDING,
    ],
    [
      [
        {
          isSynced: false,
          hasPolling: true,
          hasFailed: false,
          pollCount: 1,
        },
      ],
      RssFolderInitialSyncStatus.POLLING,
    ],
    [
      [
        {
          isSynced: false,
          hasPolling: false,
          hasFailed: true,
          pollCount: 1,
        },
      ],
      RssFolderInitialSyncStatus.FAILED,
    ],
    [
      [
        {
          isSynced: true,
          hasPolling: true,
          hasFailed: false,
          pollCount: 2,
        },
      ],
      RssFolderInitialSyncStatus.SUCCEEDED,
    ],
  ])('resolves rows %# to %s', async (rows, expected) => {
    query.mockResolvedValue(rows);

    await expect(
      service.getInitialSyncStatus('namespace-1', 'folder-1'),
    ).resolves.toBe(expected);
  });

  it('keeps waiting when a successful poll did not mark the link', async () => {
    query.mockResolvedValue([
      {
        isSynced: false,
        hasPolling: false,
        hasFailed: false,
        pollCount: 1,
      },
    ]);

    await expect(
      service.getInitialSyncStatus('namespace-1', 'folder-1'),
    ).resolves.toBe(RssFolderInitialSyncStatus.PENDING);
  });

  it('waits when a multi-feed folder still has an unpolled link', async () => {
    query.mockResolvedValue([
      {
        isSynced: true,
        hasPolling: false,
        hasFailed: false,
        pollCount: 1,
      },
      {
        isSynced: false,
        hasPolling: false,
        hasFailed: false,
        pollCount: 0,
      },
    ]);

    await expect(
      service.getInitialSyncStatus('namespace-1', 'folder-1'),
    ).resolves.toBe(RssFolderInitialSyncStatus.PENDING);
  });
});
