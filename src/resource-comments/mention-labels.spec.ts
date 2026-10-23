import { createHash } from 'node:crypto';

import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';

import { mentionDisplayName, rewriteMentionLabels } from './mention-labels';
import { ResourceCommentsService } from './resource-comments.service';

describe('mention labels', () => {
  it('formats a nickname the same way as the document editor', () => {
    expect(
      mentionDisplayName({
        nickname: 'Lizhi',
        username: 'Alice',
        email: 'a@b.c',
        userId: 'u1',
      }),
    ).toBe('Lizhi（Alice）');
  });

  it('rewrites a current member and keeps a departed member label', () => {
    const names = { u1: 'Lizhi（Alice）' };
    expect(
      rewriteMentionLabels(
        'See [@ id="u1" label="Alice"] and [@ id="gone" label="Old"]',
        names,
      ),
    ).toBe(
      'See [@ id="u1" label="Lizhi（Alice）"] and [@ id="gone" label="Old"]',
    );
  });

  it('does not rewrite a label that is already current', () => {
    const markdown = '[@ id="u1" label="Lizhi（Alice）"]';
    expect(rewriteMentionLabels(markdown, { u1: 'Lizhi（Alice）' })).toBe(
      markdown,
    );
  });
});

describe('syncMentionLabels', () => {
  const namespaceId = 'namespace';
  const resourceId = 'resource';
  const original = 'Hi [@ id="u1" label="Old"]';
  const rewritten = 'Hi [@ id="u1" label="Lizhi（Alice）"]';

  function createService(options: {
    resourceContent: string;
    resourceAfterConflict?: string;
    commentWrites?: number;
    resourceWrites?: number;
  }) {
    const queries: string[] = [];
    let reads = 0;
    const resources = {
      findOne: () => {
        reads += 1;
        const content =
          reads === 1
            ? options.resourceContent
            : (options.resourceAfterConflict ?? options.resourceContent);
        return Promise.resolve({
          id: resourceId,
          namespaceId,
          resourceType: ResourceType.DOC,
          content,
        });
      },
    };
    const comments = {
      createQueryBuilder: () => {
        const builder = {
          innerJoin: () => builder,
          where: () => builder,
          andWhere: () => builder,
          getMany: () =>
            Promise.resolve([
              { id: 'comment-1', content: '[@ id="u1" label="Old"]' },
            ]),
        };
        return builder;
      },
    };
    const dataSource = {
      getRepository: (entity: unknown) =>
        entity === Resource ? resources : comments,
      query: (sql: string) => {
        queries.push(sql);
        const affected = sql.includes('resource_comments')
          ? (options.commentWrites ?? 1)
          : (options.resourceWrites ?? 1);
        return Promise.resolve([[], affected]);
      },
    };
    const service = new ResourceCommentsService(
      {} as never,
      dataSource as never,
      {
        userHasPermissionOrFail: () => Promise.resolve(),
      } as never,
      {} as never,
      { t: (key: string) => key } as never,
      {} as never,
      {
        find: () =>
          Promise.resolve([{ userId: 'u1', nickname: 'Lizhi', namespaceId }]),
      } as never,
      {
        find: () =>
          Promise.resolve([
            { id: 'u1', username: 'Alice', email: 'a@example.com' },
          ]),
      } as never,
    );
    return { service, queries };
  }

  it('stores the current label only when the read row is still there', async () => {
    const { service, queries } = createService({ resourceContent: original });

    const result = await service.syncMentionLabels(
      namespaceId,
      resourceId,
      'viewer',
    );

    expect(queries[0]).toBe(
      'UPDATE resource_comments SET content = $1 WHERE id = $2 AND content = $3',
    );
    expect(queries[1]).toContain('AND content = $5');
    expect(result).toEqual({
      updated: 2,
      content: rewritten,
      content_hash: createHash('sha256').update(rewritten).digest('hex'),
    });
  });

  it('leaves a newer resource save in place and does not return it', async () => {
    const { service, queries } = createService({
      resourceContent: original,
      resourceAfterConflict: 'Saved later [@ id="u1" label="Old"]',
      commentWrites: 0,
      resourceWrites: 0,
    });

    const result = await service.syncMentionLabels(
      namespaceId,
      resourceId,
      'viewer',
    );

    expect(queries).toHaveLength(2);
    expect(result).toEqual({ updated: 0 });
    expect(result).not.toHaveProperty('content');
  });

  it('returns the label when another open already stored it', async () => {
    const { service } = createService({
      resourceContent: original,
      resourceAfterConflict: rewritten,
      resourceWrites: 0,
    });

    const result = await service.syncMentionLabels(
      namespaceId,
      resourceId,
      'viewer',
    );

    expect(result.content).toBe(rewritten);
    expect(result.content_hash).toBe(
      createHash('sha256').update(rewritten).digest('hex'),
    );
  });
});
