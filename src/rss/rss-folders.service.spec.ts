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
      [{ hasSucceeded: false, hasPolling: false, pollCount: 0 }],
      RssFolderInitialSyncStatus.PENDING,
    ],
    [
      [{ hasSucceeded: false, hasPolling: true, pollCount: 1 }],
      RssFolderInitialSyncStatus.POLLING,
    ],
    [
      [{ hasSucceeded: false, hasPolling: false, pollCount: 1 }],
      RssFolderInitialSyncStatus.FAILED,
    ],
    [
      [{ hasSucceeded: true, hasPolling: true, pollCount: 2 }],
      RssFolderInitialSyncStatus.SUCCEEDED,
    ],
  ])('resolves rows %# to %s', async (rows, expected) => {
    query.mockResolvedValue(rows);

    await expect(
      service.getInitialSyncStatus('namespace-1', 'folder-1'),
    ).resolves.toBe(expected);
  });

  it('waits when a multi-feed folder still has an unpolled link', async () => {
    query.mockResolvedValue([
      { hasSucceeded: true, hasPolling: false, pollCount: 1 },
      { hasSucceeded: false, hasPolling: false, pollCount: 0 },
    ]);

    await expect(
      service.getInitialSyncStatus('namespace-1', 'folder-1'),
    ).resolves.toBe(RssFolderInitialSyncStatus.PENDING);
  });
});
