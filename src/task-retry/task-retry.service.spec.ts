import { I18nService } from 'nestjs-i18n';
import { FilesService } from 'omniboxd/files/files.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { TaskRetryService } from 'omniboxd/task-retry/task-retry.service';
import { TaskDto } from 'omniboxd/tasks/dto/task.dto';
import { Task, TaskStatus } from 'omniboxd/tasks/tasks.entity';
import { TasksService } from 'omniboxd/tasks/tasks.service';

describe('TaskRetryService', () => {
  let service: TaskRetryService;
  let tasksService: { getInNamespace: jest.Mock; applyRerun: jest.Mock };
  let permissionsService: { userHasPermissionOrFail: jest.Mock };
  let resourcesService: { getResource: jest.Mock };
  let filesService: { getFile: jest.Mock };

  const task = (overrides: Partial<Task> = {}): Task =>
    ({
      id: 'task-1',
      namespaceId: 'ns-1',
      userId: 'user-1',
      priority: '5',
      function: 'file_reader',
      input: {
        title: 'Title',
        original_name: 'notes.txt',
        filename: 'notes.txt',
        mimetype: 'text/plain',
        resource_id: 'resource-1',
      },
      payload: { resource_id: 'resource-1' },
      status: TaskStatus.ERROR,
      canceledAt: null,
      retriedFromTaskId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as Task;

  const resource = (overrides: Partial<Resource> = {}): Resource =>
    ({
      id: 'resource-1',
      namespaceId: 'ns-1',
      userId: 'user-1',
      resourceType: ResourceType.FILE,
      fileId: 'file-1',
      attrs: { filename: 'notes.txt', mimetype: 'text/plain' },
      content: '',
      name: 'notes',
      ...overrides,
    }) as Resource;

  const file = (name: string, mimetype: string) =>
    ({ id: 'file-1', name, mimetype }) as any;

  const fileFromRow = (name: string, mimetype: string) => file(name, mimetype);

  const prepare = (overrides: Partial<Task> = {}, ctx = {}) =>
    service.prepare(task(overrides), {
      namespaceId: 'ns-1',
      userId: 'user-1',
      ...ctx,
    });

  beforeEach(() => {
    tasksService = {
      getInNamespace: jest.fn(),
      applyRerun: jest.fn(),
    };
    permissionsService = { userHasPermissionOrFail: jest.fn() };
    resourcesService = { getResource: jest.fn() };
    filesService = { getFile: jest.fn() };

    service = new TaskRetryService(
      tasksService as unknown as TasksService,
      permissionsService as unknown as PermissionsService,
      resourcesService as unknown as ResourcesService,
      filesService as unknown as FilesService,
      { t: (key: string) => key } as unknown as I18nService,
    );

    resourcesService.getResource.mockResolvedValue(resource());
    permissionsService.userHasPermissionOrFail.mockResolvedValue(undefined);
    filesService.getFile.mockResolvedValue(
      fileFromRow('notes.txt', 'text/plain'),
    );
  });

  describe('rerunOne', () => {
    it('binds the task to the requested namespace and applies the prepared plan', async () => {
      const original = task({ function: 'extract_tags', input: { text: 'x' } });
      const dto = { id: 'task-2' } as TaskDto;
      tasksService.getInNamespace.mockResolvedValue(original);
      tasksService.applyRerun.mockResolvedValue(dto);

      const result = await service.rerunOne('ns-1', 'user-1', 'task-1');

      expect(result).toBe(dto);
      expect(tasksService.getInNamespace).toHaveBeenCalledWith(
        'ns-1',
        'task-1',
      );
      expect(tasksService.applyRerun).toHaveBeenCalledWith({
        original,
        function: 'extract_tags',
        input: { text: 'x' },
      });
    });

    it('propagates a namespace mismatch without writing', async () => {
      tasksService.getInNamespace.mockRejectedValue(
        new Error('task not found'),
      );

      await expect(
        service.rerunOne('ns-2', 'user-1', 'task-1'),
      ).rejects.toThrow('task not found');
      expect(tasksService.applyRerun).not.toHaveBeenCalled();
    });
  });

  describe('prepare', () => {
    it.each([TaskStatus.PENDING, TaskStatus.RUNNING, TaskStatus.FINISHED])(
      'rejects a %s task',
      async (status) => {
        await expect(prepare({ status })).rejects.toMatchObject({
          code: 'CAN_ONLY_RERUN_FAILED_OR_CANCELED',
        });
        expect(tasksService.applyRerun).not.toHaveBeenCalled();
      },
    );

    it.each([
      TaskStatus.ERROR,
      TaskStatus.TIMEOUT,
      TaskStatus.INSUFFICIENT_QUOTA,
      TaskStatus.CANCELED,
    ])('accepts a %s task', async (status) => {
      const plan = await prepare({ status });

      expect(plan.function).toBe('file_reader_text');
    });

    it.each([
      'file_reader_text',
      'file_reader_pdf',
      'collect_url',
      'extract_tags',
    ])('passes a %s task through without lookups', async (fn) => {
      const original = task({ function: fn, input: { any: 'input' } });

      const plan = await service.prepare(original, {
        namespaceId: 'ns-1',
        userId: 'user-1',
      });

      expect(plan).toEqual({
        original,
        function: fn,
        input: { any: 'input' },
      });
      expect(resourcesService.getResource).not.toHaveBeenCalled();
      expect(permissionsService.userHasPermissionOrFail).not.toHaveBeenCalled();
      expect(tasksService.applyRerun).not.toHaveBeenCalled();
    });

    it('prepares without writing anything', async () => {
      const plan = await prepare();

      expect(plan.function).toBe('file_reader_text');
      expect(tasksService.applyRerun).not.toHaveBeenCalled();
      expect(tasksService.getInNamespace).not.toHaveBeenCalled();
    });

    it('rejects an input that is not a plain object', async () => {
      await expect(prepare({ input: [] })).rejects.toMatchObject({
        code: 'INVALID_FILE_READER_INPUT',
      });
      await expect(prepare({ input: null as any })).rejects.toMatchObject({
        code: 'INVALID_FILE_READER_INPUT',
      });
    });

    it.each([
      ['missing payload', undefined],
      ['null payload', null],
      ['array payload', []],
      ['missing resource_id', {}],
      ['empty resource_id', { resource_id: '' }],
      ['numeric resource_id', { resource_id: 42 }],
    ])('rejects a payload with %s', async (_label, payload) => {
      await expect(prepare({ payload: payload as any })).rejects.toMatchObject({
        code: 'INVALID_FILE_READER_INPUT',
      });
    });

    it('rejects when the payload resource cannot be found', async () => {
      resourcesService.getResource.mockResolvedValue(null);

      await expect(prepare()).rejects.toMatchObject({
        code: 'INVALID_FILE_READER_INPUT',
      });
      expect(resourcesService.getResource).toHaveBeenCalledWith(
        'ns-1',
        'resource-1',
      );
      expect(permissionsService.userHasPermissionOrFail).not.toHaveBeenCalled();
    });

    it('checks CAN_EDIT with the calling user for a task-level retry', async () => {
      await prepare();

      expect(permissionsService.userHasPermissionOrFail).toHaveBeenCalledWith(
        'ns-1',
        'resource-1',
        'user-1',
        ResourcePermission.CAN_EDIT,
      );
    });

    it('propagates a permission failure', async () => {
      permissionsService.userHasPermissionOrFail.mockRejectedValue(
        Object.assign(new Error('not authorized'), { code: 'NOT_AUTHORIZED' }),
      );

      await expect(prepare()).rejects.toMatchObject({
        code: 'NOT_AUTHORIZED',
      });
    });

    it('uses an already-authorised resource without another permission check', async () => {
      const plan = await service.prepare(task(), {
        namespaceId: 'ns-1',
        userId: 'user-2',
        resource: resource(),
      });

      expect(plan.function).toBe('file_reader_text');
      expect(permissionsService.userHasPermissionOrFail).not.toHaveBeenCalled();
      expect(resourcesService.getResource).not.toHaveBeenCalled();
    });

    it('rejects when the payload points at another resource than the authorised one', async () => {
      await expect(
        service.prepare(task({ payload: { resource_id: 'resource-2' } }), {
          namespaceId: 'ns-1',
          userId: 'user-1',
          resource: resource(),
        }),
      ).rejects.toMatchObject({ code: 'INVALID_FILE_READER_INPUT' });
    });

    it.each([
      ['another id', 'resource-2'],
      ['explicit null', null],
      ['empty string', ''],
      ['non-string', 42],
    ])('rejects a present resource_id of %s', async (_label, value) => {
      const original = task();
      original.input = { ...original.input, resource_id: value };

      await expect(
        service.prepare(original, { namespaceId: 'ns-1', userId: 'user-1' }),
      ).rejects.toMatchObject({ code: 'INVALID_FILE_READER_INPUT' });
    });

    it('fills a genuinely missing resource_id without needing evidence', async () => {
      const original = task();
      delete original.input.resource_id;

      const plan = await service.prepare(original, {
        namespaceId: 'ns-1',
        userId: 'user-1',
      });

      expect(plan.input.resource_id).toBe('resource-1');
      expect(filesService.getFile).not.toHaveBeenCalled();
    });

    it.each([
      ['no names', {}],
      ['blank names', { original_name: '   ', filename: '' }],
      ['name without extension', { original_name: '合同' }],
      ['unknown extension', { original_name: 'a.xyz' }],
      [
        'unknown original_name with a valid filename',
        { original_name: 'a.xyz', filename: 'notes.txt' },
      ],
    ])('rejects %s as an unsupported extension', async (_label, names) => {
      const original = task();
      original.input = {
        title: 'Title',
        mimetype: 'text/plain',
        resource_id: 'resource-1',
        ...names,
      };

      await expect(
        service.prepare(original, { namespaceId: 'ns-1', userId: 'user-1' }),
      ).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_EXTENSION' });
    });

    it('passes a contract-valid input through unchanged apart from the function', async () => {
      const original = task();
      original.input = { ...original.input, language: 'English' };

      const plan = await service.prepare(original, {
        namespaceId: 'ns-1',
        userId: 'user-1',
      });

      expect(plan.function).toBe('file_reader_text');
      expect(plan.input).toBe(original.input);
      expect(filesService.getFile).not.toHaveBeenCalled();
    });

    describe('repair with a bound file', () => {
      beforeEach(() => {
        filesService.getFile.mockResolvedValue(
          fileFromRow('notes.txt', 'text/plain'),
        );
      });

      it('rejects when the task carries no file-id field even if the resource has one', async () => {
        const original = task();
        original.input = { ...original.input, filename: null };

        await expect(
          service.prepare(original, { namespaceId: 'ns-1', userId: 'user-1' }),
        ).rejects.toMatchObject({ code: 'INVALID_FILE_READER_INPUT' });
        expect(filesService.getFile).not.toHaveBeenCalled();
      });

      it('rejects when the task file-id differs from the resource file', async () => {
        const original = task();
        original.input = {
          ...original.input,
          file_id: 'file-2',
          filename: null,
        };

        await expect(
          service.prepare(original, { namespaceId: 'ns-1', userId: 'user-1' }),
        ).rejects.toMatchObject({ code: 'INVALID_FILE_READER_INPUT' });
        expect(filesService.getFile).not.toHaveBeenCalled();
      });

      it('rejects when one of several file-id fields disagrees', async () => {
        const original = task();
        original.input = {
          ...original.input,
          file_id: 'file-1',
          filename: null,
        };
        original.payload = { resource_id: 'resource-1', file_id: 'file-2' };

        await expect(
          service.prepare(original, { namespaceId: 'ns-1', userId: 'user-1' }),
        ).rejects.toMatchObject({ code: 'INVALID_FILE_READER_INPUT' });
        expect(filesService.getFile).not.toHaveBeenCalled();
      });

      it('rejects when the file row no longer exists', async () => {
        filesService.getFile.mockResolvedValue(null);
        const original = task();
        original.input = {
          ...original.input,
          file_id: 'file-1',
          filename: null,
        };

        await expect(
          service.prepare(original, { namespaceId: 'ns-1', userId: 'user-1' }),
        ).rejects.toMatchObject({ code: 'INVALID_FILE_READER_INPUT' });
      });

      it('drops a null filename and keeps the confirmed original_name', async () => {
        const original = task();
        original.input = {
          ...original.input,
          file_id: 'file-1',
          filename: null,
        };

        const plan = await service.prepare(original, {
          namespaceId: 'ns-1',
          userId: 'user-1',
        });

        expect(plan.function).toBe('file_reader_text');
        expect(plan.input).toEqual({
          title: 'Title',
          original_name: 'notes.txt',
          mimetype: 'text/plain',
          resource_id: 'resource-1',
          file_id: 'file-1',
        });
        expect(plan.input).not.toHaveProperty('filename');
      });

      it('fills a missing original_name from the file row', async () => {
        const original = task();
        original.input = {
          title: 'Title',
          filename: 'notes.txt',
          mimetype: 'text/plain',
          resource_id: 'resource-1',
          fileId: 'file-1',
        };

        const plan = await service.prepare(original, {
          namespaceId: 'ns-1',
          userId: 'user-1',
        });

        expect(plan.input.original_name).toBe('notes.txt');
        expect(plan.input.fileId).toBe('file-1');
      });

      it('fills a missing mimetype from the file row', async () => {
        const original = task();
        original.input = {
          title: 'Title',
          original_name: 'notes.txt',
          filename: 'notes.txt',
          resource_id: 'resource-1',
          file_id: 'file-1',
        };

        const plan = await service.prepare(original, {
          namespaceId: 'ns-1',
          userId: 'user-1',
        });

        expect(plan.input.mimetype).toBe('text/plain');
      });

      it('rejects a missing title, which no file field can supply', async () => {
        const original = task();
        original.input = {
          original_name: 'notes.txt',
          filename: null,
          mimetype: 'text/plain',
          resource_id: 'resource-1',
          file_id: 'file-1',
        };

        await expect(
          service.prepare(original, { namespaceId: 'ns-1', userId: 'user-1' }),
        ).rejects.toMatchObject({ code: 'INVALID_FILE_READER_INPUT' });
      });

      it('resolves an original_name/filename conflict from the file row', async () => {
        filesService.getFile.mockResolvedValue(
          fileFromRow('resolved.pdf', 'application/pdf'),
        );
        const original = task();
        original.input = {
          title: 'Title',
          original_name: '合同.docx',
          filename: 'a.pdf',
          mimetype: 'application/pdf',
          resource_id: 'resource-1',
          file_id: 'file-1',
        };

        const plan = await service.prepare(original, {
          namespaceId: 'ns-1',
          userId: 'user-1',
        });

        expect(plan.function).toBe('file_reader_pdf');
        expect(plan.input.original_name).toBe('resolved.pdf');
        expect(plan.input.filename).toBe('a.pdf');
      });

      it('resolves the reverse conflict from the file row', async () => {
        filesService.getFile.mockResolvedValue(
          fileFromRow('resolved.pdf', 'application/pdf'),
        );
        const original = task();
        original.input = {
          title: 'Title',
          original_name: 'a.pdf',
          filename: '合同.docx',
          mimetype: 'application/pdf',
          resource_id: 'resource-1',
          file_id: 'file-1',
        };

        const plan = await service.prepare(original, {
          namespaceId: 'ns-1',
          userId: 'user-1',
        });

        expect(plan.function).toBe('file_reader_pdf');
        expect(plan.input.original_name).toBe('a.pdf');
        expect(plan.input).not.toHaveProperty('filename');
      });

      it('rejects a conflict without evidence', async () => {
        const original = task();
        original.input = {
          title: 'Title',
          original_name: '合同.docx',
          filename: 'a.pdf',
          mimetype: 'application/pdf',
          resource_id: 'resource-1',
        };

        await expect(
          service.prepare(original, { namespaceId: 'ns-1', userId: 'user-1' }),
        ).rejects.toMatchObject({ code: 'INVALID_FILE_READER_INPUT' });
        expect(filesService.getFile).not.toHaveBeenCalled();
      });

      it('rejects a conflict when the file name has no supported suffix', async () => {
        filesService.getFile.mockResolvedValue(
          fileFromRow('a.xyz', 'application/octet-stream'),
        );
        const original = task();
        original.input = {
          title: 'Title',
          original_name: '合同.docx',
          filename: 'a.pdf',
          mimetype: 'application/pdf',
          resource_id: 'resource-1',
          file_id: 'file-1',
        };

        await expect(
          service.prepare(original, { namespaceId: 'ns-1', userId: 'user-1' }),
        ).rejects.toMatchObject({ code: 'INVALID_FILE_READER_INPUT' });
      });

      it('rejects when the file row contradicts the function chosen from the names', async () => {
        filesService.getFile.mockResolvedValue(
          fileFromRow('resolved.pdf', 'application/pdf'),
        );
        const original = task();
        original.input = {
          ...original.input,
          file_id: 'file-1',
          filename: null,
        };

        await expect(
          service.prepare(original, { namespaceId: 'ns-1', userId: 'user-1' }),
        ).rejects.toMatchObject({ code: 'INVALID_FILE_READER_INPUT' });
      });
    });
  });
});
