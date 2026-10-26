import { I18nService } from 'nestjs-i18n';
import * as identityNames from 'omniboxd/namespaces/member-display-names';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import {
  DataSource,
  EntitySchema,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';

import { ResourceCommentThread } from './entities/resource-comment-thread.entity';
import { ResourceCommentAnchorsService } from './resource-comment-anchors.service';
import { ResourceCommentQueriesService } from './resource-comment-queries.service';

// Use TypeORM's real query generation without opening a database connection.
const source = new DataSource({
  type: 'postgres',
  entities: [
    new EntitySchema({
      name: 'ResourceCommentThread',
      target: ResourceCommentThread,
      tableName: 'resource_comment_threads',
      columns: {
        id: { type: 'uuid', primary: true },
        namespaceId: { name: 'namespace_id', type: String },
        resourceId: { name: 'resource_id', type: String },
        type: { type: String },
        createdAt: { name: 'created_at', type: Date },
        resolvedAt: { name: 'resolved_at', type: Date, nullable: true },
        deletedAt: {
          name: 'deleted_at',
          type: Date,
          nullable: true,
          deleteDate: true,
        },
      },
    }),
  ],
});
const makeThread = (id: string, type = 'document') =>
  Object.assign(new ResourceCommentThread(), {
    id,
    namespaceId: 'namespace',
    resourceId: 'resource',
    type,
    quotedText: '',
    resolvedAt: null,
    comments: [],
    creatorId: 'author',
    createdAt: new Date('2026-10-20T00:00:00Z'),
    updatedAt: new Date('2026-10-20T00:00:00Z'),
  });

describe('ResourceCommentQueriesService views and direct lookup', () => {
  let repository: Repository<ResourceCommentThread>;
  let service: ResourceCommentQueriesService;
  let permission: jest.Mock;
  let builders: SelectQueryBuilder<ResourceCommentThread>[];
  let page: ResourceCommentThread[];
  let total: number;
  let hydrated: ResourceCommentThread[];
  let lookup: ResourceCommentThread | null;

  beforeAll(async () => {
    await (source as any).buildMetadatas();
  });

  beforeEach(() => {
    jest
      .spyOn(identityNames, 'resolveMemberDisplayNames')
      .mockResolvedValue({ author: 'Nick（Author）' });
    repository = source.getRepository(ResourceCommentThread);
    permission = jest.fn().mockResolvedValue(undefined);
    builders = [];
    page = [];
    total = 0;
    hydrated = [];
    lookup = null;
    const realCreateQueryBuilder =
      repository.createQueryBuilder.bind(repository);
    jest
      .spyOn(repository, 'createQueryBuilder')
      .mockImplementation((...args) => {
        const builder = realCreateQueryBuilder(...args);
        // Relations are not relevant to the scope/filter/order SQL being tested.
        jest.spyOn(builder, 'leftJoinAndSelect').mockReturnThis();
        jest
          .spyOn(builder, 'getManyAndCount')
          .mockImplementation(() => Promise.resolve([page, total]));
        jest
          .spyOn(builder, 'getMany')
          .mockImplementation(() => Promise.resolve(hydrated));
        jest
          .spyOn(builder, 'getOne')
          .mockImplementation(() => Promise.resolve(lookup));
        builders.push(builder);
        return builder;
      });
    service = new ResourceCommentQueriesService(
      repository,
      { userHasPermissionOrFail: permission } as unknown as PermissionsService,
      new ResourceCommentAnchorsService({
        t: (key: string) => key,
      } as I18nService),
      { t: (key: string) => key } as I18nService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('keeps the legacy default view inline-only and newest first', async () => {
    await service.listThreads('namespace', 'resource', 'viewer', {
      offset: 0,
      limit: 20,
    });
    expect(builders[0].getParameters()).toMatchObject({ type: 'inline' });
    expect(builders[0].getSql()).toContain('"thread"."type" =');
    expect(builders[0].expressionMap.orderBys).toEqual({
      'thread.created_at': 'DESC',
      'thread.id': 'DESC',
    });
  });

  it('keeps embedded resource comment data inline-only', async () => {
    await service.getResourceCommentData('namespace', 'resource', 'body');
    expect(builders[0].getParameters()).toMatchObject({ type: 'inline' });
    expect(builders[0].getSql()).toContain('"thread"."type" =');
  });

  it.each(['inline', 'document'] as const)(
    'orders the explicit %s view by original creation and id',
    async (view) => {
      await service.listThreads('namespace', 'resource', 'viewer', {
        view,
        offset: 0,
        limit: 20,
      });
      expect(builders[0].getParameters()).toMatchObject({ type: view });
      expect(builders[0].expressionMap.orderBys).toEqual({
        'thread.created_at': 'ASC',
        'thread.id': 'ASC',
      });
      expect(builders[0].getSql()).toContain('"thread"."deleted_at" IS NULL');
    },
  );

  it('groups sidebar inline threads before resolved document threads before paging', async () => {
    await service.listThreads('namespace', 'resource', 'viewer', {
      view: 'sidebar',
      resolved: 'true',
      offset: 20,
      limit: 20,
    });
    const sql = builders[0].getSql();
    expect(sql.replaceAll('"', '')).toContain(
      "thread.type = 'inline' OR (thread.type = 'document' AND thread.resolved_at IS NOT NULL)",
    );
    expect(sql).toContain('"thread"."resolved_at" IS NOT NULL');
    expect(Object.values(builders[0].expressionMap.orderBys)).toEqual([
      'ASC',
      'ASC',
      'ASC',
    ]);
    expect(Object.keys(builders[0].expressionMap.orderBys)[0]).toContain(
      'CASE',
    );
    expect(builders[0].expressionMap.skip).toBe(20);
    expect(builders[0].expressionMap.take).toBe(20);
  });

  it('retains a stable second page of 25 tied document threads and the full count', async () => {
    const all = Array.from({ length: 25 }, (_, index) =>
      makeThread(`thread-${String(index).padStart(2, '0')}`),
    );
    page = all.slice(20);
    total = 25;
    hydrated = [...page].reverse();
    const result = await service.listThreads(
      'namespace',
      'resource',
      'viewer',
      { view: 'document', resolved: 'false', offset: 20, limit: 20 },
    );
    expect(result.items.map((item) => item.id)).toEqual(
      all.slice(20).map((item) => item.id),
    );
    expect(result).toMatchObject({
      total: 25,
      offset: 20,
      limit: 20,
      has_more: false,
    });
    expect(builders[0].getSql()).toContain('"thread"."resolved_at" IS NULL');
  });

  it('checks CAN_VIEW and scopes direct lookup to namespace and resource', async () => {
    lookup = makeThread('outside-current-page');
    const result = await (service as any).getThread(
      'namespace',
      'resource',
      'outside-current-page',
      'viewer',
    );
    expect(result.id).toBe('outside-current-page');
    expect(result.creator.display_name).toBe('Nick（Author）');
    expect(identityNames.resolveMemberDisplayNames).toHaveBeenCalledWith(
      repository.manager,
      'namespace',
      ['author'],
    );
    expect(permission).toHaveBeenCalledWith(
      'namespace',
      'resource',
      'viewer',
      ResourcePermission.CAN_VIEW,
    );
    expect(builders[0].getParameters()).toMatchObject({
      namespaceId: 'namespace',
      resourceId: 'resource',
      threadId: 'outside-current-page',
    });
    const sql = builders[0].getSql();
    expect(sql).toContain('"thread"."namespace_id" =');
    expect(sql).toContain('"thread"."resource_id" =');
    expect(sql).toContain('"thread"."deleted_at" IS NULL');
  });

  it('returns 404 when a scoped thread is missing or soft-deleted', async () => {
    await expect(
      (service as any).getThread(
        'namespace',
        'resource',
        'deleted-thread',
        'viewer',
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('refuses a direct lookup before reading when access is denied', async () => {
    permission.mockRejectedValueOnce(new Error('Access denied'));
    await expect(
      (service as any).getThread('namespace', 'resource', 'thread', 'viewer'),
    ).rejects.toThrow('Access denied');
    expect(builders).toHaveLength(0);
  });
});
