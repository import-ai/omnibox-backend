import * as guards from './comment-rollback-guards';

describe('document comment schema rollback', () => {
  it('refuses rollback outside a transaction before taking a lock', async () => {
    const query = jest.fn();
    const rollback = (guards as any).assertNoDocumentCommentThreads;
    expect(typeof rollback).toBe('function');
    await expect(
      rollback({ isTransactionActive: false, query }),
    ).rejects.toThrow('transaction');
    expect(query).not.toHaveBeenCalled();
  });

  it('locks threads and guards every document row including deleted rows without purging data', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const rollback = (guards as any).assertNoDocumentCommentThreads;
    expect(typeof rollback).toBe('function');
    await rollback({ isTransactionActive: true, query });
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain(
      'LOCK TABLE resource_comment_threads IN ACCESS EXCLUSIVE MODE',
    );
    expect(sql).toContain("WHERE type = 'document'");
    expect(sql).not.toContain('deleted_at IS NULL');
    expect(sql).toContain('RAISE EXCEPTION');
    expect(sql).not.toMatch(/DELETE FROM|UPDATE resource_comment_threads/);
  });
});
