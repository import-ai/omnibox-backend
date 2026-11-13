import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { firstValueFrom, from } from 'rxjs';

import { NamespaceResourcesController } from '../namespace-resources/namespace-resources.controller';
import { NamespaceResourcesService } from '../namespace-resources/namespace-resources.service';
import { BehaviorInterceptor } from './behavior.interceptor';
import { BehaviorService } from './behavior.service';

function fixture(editableIds: string[], movedIds = editableIds) {
  const manager = {
    findOne: jest.fn(() => Promise.resolve({ id: 'namespace' })),
    transaction: (run: (tx: unknown) => Promise<unknown>) => run(manager),
  };
  const folder = {
    id: 'created-folder',
    resourceType: ResourceType.FOLDER,
  } as Resource;
  const service = Object.create(
    NamespaceResourcesService.prototype,
  ) as NamespaceResourcesService;
  const create = jest.fn(() => Promise.resolve(folder));
  const move = jest.fn(() =>
    Promise.resolve({ movedIds, nameConflictIds: [] }),
  );
  Object.assign(service, {
    dataSource: { manager },
    getBatchTopLevelResourceIds: () => Promise.resolve(['first', 'second']),
    permissionsService: { userHasPermission: () => Promise.resolve(true) },
    ensureResourceNameNotExists: async () => {},
    getEditableResourceIds: () => Promise.resolve(new Set(editableIds)),
    rssFoldersQuotaService: { assertMoveQuota: async () => {} },
    resourcesService: { batchMoveResources: move },
    create,
    getResource: () => Promise.resolve(folder),
  });
  const controller = new NamespaceResourcesController(
    service,
    undefined!,
    undefined!,
    undefined!,
  );
  const behavior = {
    enabled: () => true,
    begin: jest.fn(() => Promise.resolve(true)),
    bind: jest.fn(async () => {}),
    result: jest.fn(async () => {}),
  };
  const interceptor = new BehaviorInterceptor(
    behavior as unknown as BehaviorService,
  );
  const headers: Record<string, string> = {
    'x-omnibox-action-id': '7cfa8e55-7a81-4125-9e1f-446b4b2d069f',
    'x-omnibox-action-started-at': new Date().toISOString(),
    'x-client-platform': 'web',
  };
  const body = {
    parentId: 'editable-parent',
    name: 'New folder',
    resourceIds: ['first', 'second'],
  };
  const request = {
    method: 'POST',
    originalUrl:
      '/api/v1/namespaces/namespace/resources/batch-folder?source=menu',
    body,
    user: { id: 'fixture-user' },
    header: (name: string) => headers[name],
  } as unknown as Request;
  const execution = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
  async function run() {
    const response = await firstValueFrom(
      interceptor.intercept(execution, {
        handle: () =>
          from(controller.batchCreateFolder('fixture-user', 'namespace', body)),
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
    return response;
  }
  return { create, move, behavior, run };
}

it('records failure when the real batch-create path creates no folder', async () => {
  const f = fixture([]);
  expect(await f.run()).toEqual({
    successIds: [],
    failedIds: ['first', 'second'],
    nameConflictIds: [],
  });
  expect(f.create).not.toHaveBeenCalled();
  expect(f.move).not.toHaveBeenCalled();
  expect(f.behavior.result).toHaveBeenCalledTimes(1);
  expect(f.behavior.result).toHaveBeenCalledWith(
    expect.objectContaining({ action_type: 'resource_add' }),
    'failed',
  );
});

it.each([
  [
    ['first', 'second'],
    ['first', 'second'],
  ],
  [['first'], ['first']],
  [['first'], []],
])(
  'records success when a folder was created, regardless of moved item count (%j -> %j)',
  async (editable, moved) => {
    const f = fixture(editable, moved);
    expect(await f.run()).toMatchObject({
      id: 'created-folder',
      successIds: moved,
    });
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.behavior.bind).toHaveBeenCalledWith(
      expect.anything(),
      'created-folder',
      undefined,
    );
    expect(f.behavior.result).toHaveBeenCalledTimes(1);
    expect(f.behavior.result).toHaveBeenCalledWith(
      expect.objectContaining({ action_type: 'resource_add' }),
      'success',
    );
  },
);
