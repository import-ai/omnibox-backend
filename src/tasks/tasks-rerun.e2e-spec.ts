import { HttpStatus } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { S3Service } from 'omniboxd/s3/s3.service';
import { Task, TaskStatus } from 'omniboxd/tasks/tasks.entity';
import { TestClient } from 'test/test-client';
import { Repository } from 'typeorm';

describe('Task-level retry (e2e)', () => {
  let client: TestClient;
  let viewerClient: TestClient;
  let memberClient: TestClient;
  let taskRepo: Repository<Task>;
  let resourceRepo: Repository<Resource>;
  let putObjectSpy: jest.SpyInstance;
  let uid = 0;

  const uniqueName = (base: string) => `${base} ${++uid}`;

  const namespaceId = () => client.namespace.id;

  const createFileResource = async (filename: string, mimetype: string) => {
    const upload = await client
      .post(`/api/v1/namespaces/${namespaceId()}/resources/files`)
      .send({ name: filename, mimetype, size: 1024 })
      .expect(HttpStatus.CREATED);
    const response = await client
      .post(`/api/v1/namespaces/${namespaceId()}/resources`)
      .send({
        name: uniqueName(filename),
        resourceType: ResourceType.FILE,
        parentId: client.namespace.root_resource_id,
        file_id: upload.body.id,
        attrs: { original_name: filename, filename, mimetype },
      })
      .expect(HttpStatus.CREATED);
    // ResourceDto does not expose fileId; the resource takes the uploaded id.
    return { ...response.body, file_id: upload.body.id };
  };

  const createLinkResource = async (url: string) => {
    const response = await client
      .post(`/api/v1/namespaces/${namespaceId()}/resources`)
      .send({
        name: uniqueName('Link'),
        resourceType: ResourceType.LINK,
        parentId: client.namespace.root_resource_id,
        attrs: { url },
      })
      .expect(HttpStatus.CREATED);
    return response.body;
  };

  const addTask = async (
    resourceId: string,
    overrides: Partial<Task>,
    createdAt?: Date,
  ): Promise<Task> => {
    const task = await taskRepo.save(
      taskRepo.create({
        namespaceId: namespaceId(),
        userId: client.user.id,
        function: 'extract_tags',
        input: { resource_id: resourceId },
        payload: { resource_id: resourceId },
        status: TaskStatus.FINISHED,
        endedAt: new Date(),
        ...overrides,
      }),
    );
    if (createdAt) {
      await taskRepo.update(task.id, { createdAt });
      task.createdAt = createdAt;
    }
    return task;
  };

  const addLegacyTask = async (
    resourceId: string,
    input: Record<string, any>,
    overrides: Partial<Task> = {},
  ): Promise<Task> =>
    await addTask(resourceId, {
      function: 'file_reader',
      input: { resource_id: resourceId, ...input },
      // The old single-kind emitter wrote {resource_id, source} and no
      // user.options; neither worker needs the missing options.
      payload: { resource_id: resourceId, source: 'default' },
      status: TaskStatus.ERROR,
      endedAt: new Date(),
      exception: { error: 'legacy failure' },
      ...overrides,
    });

  const rerun = (
    taskId: string,
    options: { namespace?: string; as?: TestClient } = {},
  ) =>
    (options.as ?? client).post(
      `/api/v1/namespaces/${options.namespace ?? namespaceId()}/tasks/${taskId}/rerun`,
    );

  const taskCount = (resourceId: string) =>
    taskRepo.count({ where: { resourceId } });

  const getResource = async (resourceId: string) =>
    await resourceRepo.findOneByOrFail({
      namespaceId: namespaceId(),
      id: resourceId,
    });

  const invite = async (
    invitee: TestClient,
    permission: ResourcePermission,
  ) => {
    const invitation = await client
      .post(`/api/v1/namespaces/${namespaceId()}/invitations`)
      .send({ namespaceRole: 'member', rootPermission: permission })
      .expect(HttpStatus.CREATED);
    await invitee
      .post(
        `/api/v1/namespaces/${namespaceId()}/invitations/${invitation.body.id}/accept`,
      )
      .expect(HttpStatus.CREATED);
  };

  const legacyInput = (overrides: Record<string, any> = {}) => ({
    title: 'Legacy task',
    original_name: 'legacy.txt',
    filename: 'legacy.txt',
    mimetype: 'text/plain',
    ...overrides,
  });

  beforeAll(async () => {
    client = await TestClient.create();
    taskRepo = client.app.get<Repository<Task>>(getRepositoryToken(Task));
    resourceRepo = client.app.get<Repository<Resource>>(
      getRepositoryToken(Resource),
    );
    putObjectSpy = jest.spyOn(client.app.get(S3Service), 'putObject');
  });

  afterAll(async () => {
    await memberClient?.close();
    await viewerClient?.close();
    await client?.close();
  });

  beforeEach(() => {
    putObjectSpy.mockClear();
  });

  describe('format resolution', () => {
    it('retries an old file_reader as the format function and points back at it', async () => {
      const resource = await createFileResource('legacy.txt', 'text/plain');
      const original = await addLegacyTask(resource.id, legacyInput());

      const response = await rerun(original.id).expect(HttpStatus.CREATED);

      expect(response.body.function).toBe('file_reader_text');
      expect(response.body.status).toBe(TaskStatus.PENDING);
      expect(response.body.retried_from_task_id).toBe(original.id);
      expect(response.body.input).toEqual(original.input);
      expect(response.body.resource_id).toBe(resource.id);
      expect(response.body.user_id).toBe(client.user.id);
    });

    it('infers the function from an uppercase extension', async () => {
      const resource = await createFileResource('报告.PDF', 'application/pdf');
      const original = await addLegacyTask(
        resource.id,
        legacyInput({ original_name: '报告.PDF', filename: '报告.PDF' }),
      );

      const response = await rerun(original.id).expect(HttpStatus.CREATED);

      expect(response.body.function).toBe('file_reader_pdf');
      // No pro wizard is configured in the e2e environment, so the pro-only
      // function fails up front instead of staying pending.
      expect(response.body.status).toBe(TaskStatus.ERROR);
      expect(response.body.exception.type).toBe('UnsupportedFunctionError');
    });

    it('retries a task that already carries a per-format function unchanged', async () => {
      const resource = await createFileResource('typed.txt', 'text/plain');
      const original = await addTask(resource.id, {
        function: 'file_reader_text',
        input: legacyInput(),
        status: TaskStatus.ERROR,
        exception: { error: 'boom' },
      });

      const response = await rerun(original.id).expect(HttpStatus.CREATED);

      expect(response.body.function).toBe('file_reader_text');
      expect(response.body.input).toEqual(original.input);
      expect(response.body.retried_from_task_id).toBe(original.id);
      expect(putObjectSpy).not.toHaveBeenCalled();
    });

    it.each([
      TaskStatus.ERROR,
      TaskStatus.TIMEOUT,
      TaskStatus.INSUFFICIENT_QUOTA,
      TaskStatus.CANCELED,
    ])('retries an old file_reader that is %s', async (status) => {
      const resource = await createFileResource('four.pdf', 'application/pdf');
      const original = await addLegacyTask(
        resource.id,
        legacyInput({ original_name: 'four.pdf', filename: 'four.pdf' }),
        {
          status,
          canceledAt: status === TaskStatus.CANCELED ? new Date() : null,
        },
      );

      const response = await rerun(original.id).expect(HttpStatus.CREATED);

      expect(response.body.function).toBe('file_reader_pdf');
      expect(response.body.retried_from_task_id).toBe(original.id);
    });
  });

  describe('gates', () => {
    it.each([TaskStatus.PENDING, TaskStatus.RUNNING, TaskStatus.FINISHED])(
      'refuses to retry a %s task',
      async (status) => {
        const resource = await createFileResource('gate.txt', 'text/plain');
        const original = await addLegacyTask(resource.id, legacyInput(), {
          status,
          endedAt: status === TaskStatus.FINISHED ? new Date() : null,
        });
        const before = await taskCount(resource.id);

        const response = await rerun(original.id).expect(
          HttpStatus.BAD_REQUEST,
        );

        expect(response.body.code).toBe('can_only_rerun_failed_or_canceled');
        expect(await taskCount(resource.id)).toBe(before);
        expect(putObjectSpy).not.toHaveBeenCalled();
      },
    );

    it('reports a task from another namespace as not found', async () => {
      viewerClient = await TestClient.create();
      const resource = await createFileResource('scoped.txt', 'text/plain');
      await resourceRepo.update(resource.id, { content: 'error' });
      const original = await addLegacyTask(resource.id, legacyInput());
      const before = await taskCount(resource.id);

      const response = await rerun(original.id, {
        namespace: viewerClient.namespace.id,
      }).expect(HttpStatus.NOT_FOUND);

      expect(response.body.code).toBe('task_not_found');
      expect(await taskCount(resource.id)).toBe(before);
      expect(putObjectSpy).not.toHaveBeenCalled();
      expect((await getResource(resource.id)).content).toBe('error');
    });

    it('rejects a member with view permission even though the owner could retry', async () => {
      if (!viewerClient) viewerClient = await TestClient.create();
      await invite(viewerClient, ResourcePermission.CAN_VIEW);
      const resource = await createFileResource('viewonly.txt', 'text/plain');
      await resourceRepo.update(resource.id, { content: 'error' });
      const original = await addLegacyTask(resource.id, legacyInput());
      const before = await taskCount(resource.id);

      const response = await rerun(original.id, {
        as: viewerClient,
      }).expect(HttpStatus.FORBIDDEN);

      expect(response.body.code).toBe('not_authorized');
      expect(await taskCount(resource.id)).toBe(before);
      expect(putObjectSpy).not.toHaveBeenCalled();
      expect((await getResource(resource.id)).content).toBe('error');
      expect(original.userId).toBe(client.user.id);
    });

    it('lets a CAN_EDIT member retry and keeps the original owner', async () => {
      memberClient = await TestClient.create();
      await invite(memberClient, ResourcePermission.CAN_EDIT);
      const resource = await createFileResource('shared.txt', 'text/plain');
      const original = await addLegacyTask(resource.id, legacyInput());

      const response = await rerun(original.id, {
        as: memberClient,
      }).expect(HttpStatus.CREATED);

      expect(response.body.function).toBe('file_reader_text');
      expect(response.body.user_id).toBe(client.user.id);
      expect(response.body.retried_from_task_id).toBe(original.id);
    });
  });

  describe('resource association', () => {
    it('rejects a payload pointing at a resource that does not exist', async () => {
      const resource = await createFileResource('orphan.txt', 'text/plain');
      const original = await addTask(resource.id, {
        function: 'file_reader',
        input: legacyInput(),
        payload: { resource_id: 'missing-resource' },
        status: TaskStatus.ERROR,
        exception: { error: 'boom' },
      });
      const before = await taskCount(resource.id);

      const response = await rerun(original.id).expect(HttpStatus.BAD_REQUEST);

      expect(response.body.code).toBe('invalid_file_reader_input');
      expect(await taskCount(resource.id)).toBe(before);
      expect(putObjectSpy).not.toHaveBeenCalled();
    });

    it.each([
      ['missing payload', null],
      ['empty payload', {}],
      ['non-string resource_id', { resource_id: 42 }],
    ])('rejects a %s', async (_label, payload) => {
      const resource = await createFileResource('payload.txt', 'text/plain');
      const original = await addTask(resource.id, {
        function: 'file_reader',
        input: legacyInput(),
        payload: payload as any,
        status: TaskStatus.ERROR,
        exception: { error: 'boom' },
      });
      const before = await taskCount(resource.id);

      const response = await rerun(original.id).expect(HttpStatus.BAD_REQUEST);

      expect(response.body.code).toBe('invalid_file_reader_input');
      expect(await taskCount(resource.id)).toBe(before);
    });

    it.each([
      ['another resource', 'other-resource'],
      ['explicit null', null],
      ['empty string', ''],
    ])('rejects an input.resource_id of %s', async (_label, resourceId) => {
      const resource = await createFileResource('mismatch.txt', 'text/plain');
      const original = await addLegacyTask(resource.id, {
        ...legacyInput(),
        resource_id: resourceId,
      });
      const before = await taskCount(resource.id);

      const response = await rerun(original.id).expect(HttpStatus.BAD_REQUEST);

      expect(response.body.code).toBe('invalid_file_reader_input');
      expect(await taskCount(resource.id)).toBe(before);
    });

    it('fills a genuinely missing resource_id', async () => {
      const resource = await createFileResource('fill.txt', 'text/plain');
      const original = await addTask(resource.id, {
        function: 'file_reader',
        input: legacyInput(),
        payload: { resource_id: resource.id },
        status: TaskStatus.ERROR,
        exception: { error: 'boom' },
      });

      const response = await rerun(original.id).expect(HttpStatus.CREATED);

      expect(response.body.function).toBe('file_reader_text');
      expect(response.body.input.resource_id).toBe(resource.id);
    });
  });

  describe('format selection', () => {
    it.each([
      ['no usable names', {}],
      [
        'a name without an extension',
        { original_name: '合同', filename: null },
      ],
      ['an unknown extension', { original_name: 'a.xyz' }],
      [
        'an unknown original_name even with a valid filename',
        { original_name: 'a.xyz', filename: 'legacy.txt' },
      ],
    ])('rejects %s as unsupported', async (_label, names) => {
      const resource = await createFileResource(
        'unsupported.txt',
        'text/plain',
      );
      const original = await addLegacyTask(resource.id, {
        title: 'Legacy task',
        mimetype: 'text/plain',
        ...names,
      });
      const before = await taskCount(resource.id);

      const response = await rerun(original.id).expect(HttpStatus.BAD_REQUEST);

      expect(response.body.code).toBe('unsupported_file_extension');
      expect(await taskCount(resource.id)).toBe(before);
      expect(putObjectSpy).not.toHaveBeenCalled();
    });

    it('rejects a Word/PDF conflict without evidence', async () => {
      const resource = await createFileResource('conflict.txt', 'text/plain');
      const original = await addLegacyTask(resource.id, {
        title: 'Legacy task',
        original_name: '合同.docx',
        filename: 'a.pdf',
        mimetype: 'application/pdf',
      });

      const response = await rerun(original.id).expect(HttpStatus.BAD_REQUEST);

      expect(response.body.code).toBe('invalid_file_reader_input');
    });

    it('rejects the reverse conflict without evidence', async () => {
      const resource = await createFileResource('conflict2.txt', 'text/plain');
      const original = await addLegacyTask(resource.id, {
        title: 'Legacy task',
        original_name: 'a.pdf',
        filename: '合同.docx',
        mimetype: 'application/pdf',
      });

      const response = await rerun(original.id).expect(HttpStatus.BAD_REQUEST);

      expect(response.body.code).toBe('invalid_file_reader_input');
    });

    it('resolves a Word/PDF conflict from the bound file row', async () => {
      const resource = await createFileResource(
        'resolved.pdf',
        'application/pdf',
      );
      const original = await addLegacyTask(resource.id, {
        title: 'Legacy task',
        original_name: '合同.docx',
        filename: 'a.pdf',
        mimetype: 'application/pdf',
        file_id: resource.file_id,
      });

      const response = await rerun(original.id).expect(HttpStatus.CREATED);

      expect(response.body.function).toBe('file_reader_pdf');
      expect(response.body.input.original_name).toBe('resolved.pdf');
      expect(response.body.input.filename).toBe('a.pdf');
      expect(response.body.input.file_id).toBe(resource.file_id);
    });

    it('resolves the reverse conflict from the bound file row', async () => {
      const resource = await createFileResource(
        'resolved2.pdf',
        'application/pdf',
      );
      const original = await addLegacyTask(resource.id, {
        title: 'Legacy task',
        original_name: 'a.pdf',
        filename: '合同.docx',
        mimetype: 'application/pdf',
        fileId: resource.file_id,
      });

      const response = await rerun(original.id).expect(HttpStatus.CREATED);

      expect(response.body.function).toBe('file_reader_pdf');
      expect(response.body.input.original_name).toBe('a.pdf');
      expect(response.body.input).not.toHaveProperty('filename');
    });

    it('passes a contract-valid input through even when the resource has no matching evidence', async () => {
      const resource = await createFileResource('pass.txt', 'text/plain');
      const original = await addLegacyTask(resource.id, legacyInput());

      const response = await rerun(original.id).expect(HttpStatus.CREATED);

      expect(response.body.function).toBe('file_reader_text');
      expect(response.body.input).toEqual(original.input);
      expect(response.body.input).not.toHaveProperty('file_id');
    });
  });

  describe('repair from the bound file', () => {
    it('rejects a repair when the task carries no file-id evidence', async () => {
      const resource = await createFileResource(
        'noevidence.docx',
        'application/msword',
      );
      const original = await addLegacyTask(resource.id, {
        title: 'Legacy task',
        original_name: 'noevidence.docx',
        filename: null,
        mimetype: 'application/msword',
      });
      const before = await taskCount(resource.id);

      const response = await rerun(original.id).expect(HttpStatus.BAD_REQUEST);

      expect(response.body.code).toBe('invalid_file_reader_input');
      expect(await taskCount(resource.id)).toBe(before);
      expect(putObjectSpy).not.toHaveBeenCalled();
    });

    it('drops an invalid filename and keeps the confirmed original_name', async () => {
      const resource = await createFileResource(
        '合同.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      const original = await addLegacyTask(resource.id, {
        title: 'Legacy task',
        original_name: '合同.docx',
        filename: null,
        mimetype:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        file_id: resource.file_id,
      });

      const response = await rerun(original.id).expect(HttpStatus.CREATED);

      expect(response.body.function).toBe('file_reader_word');
      expect(response.body.input.original_name).toBe('合同.docx');
      expect(response.body.input).not.toHaveProperty('filename');
      expect(response.body.input.file_id).toBe(resource.file_id);
      const reloaded = await taskRepo.findOneByOrFail({ id: original.id });
      expect(reloaded.input).toEqual(original.input);
      expect(reloaded.status).toBe(TaskStatus.ERROR);
    });

    it('fills a missing original_name from the file row', async () => {
      const resource = await createFileResource('notes.txt', 'text/plain');
      const original = await addLegacyTask(resource.id, {
        title: 'Legacy task',
        filename: 'notes.txt',
        mimetype: 'text/plain',
        fileId: resource.file_id,
      });

      const response = await rerun(original.id).expect(HttpStatus.CREATED);

      expect(response.body.function).toBe('file_reader_text');
      expect(response.body.input.original_name).toBe('notes.txt');
      expect(response.body.input.filename).toBe('notes.txt');
    });

    it('fills a missing mimetype from the file row', async () => {
      const resource = await createFileResource('mime.txt', 'text/plain');
      const original = await addLegacyTask(resource.id, {
        title: 'Legacy task',
        original_name: 'mime.txt',
        filename: 'mime.txt',
        file_id: resource.file_id,
      });

      const response = await rerun(original.id).expect(HttpStatus.CREATED);

      expect(response.body.input.mimetype).toBe('text/plain');
    });

    it('rejects a missing title even with evidence, since files carry none', async () => {
      const resource = await createFileResource('notitle.txt', 'text/plain');
      const original = await addLegacyTask(resource.id, {
        original_name: 'notitle.txt',
        filename: null,
        mimetype: 'text/plain',
        file_id: resource.file_id,
      });

      const response = await rerun(original.id).expect(HttpStatus.BAD_REQUEST);

      expect(response.body.code).toBe('invalid_file_reader_input');
    });
  });

  describe('inline HTML', () => {
    it('uploads inline HTML once and stores only its S3 key', async () => {
      const resource = await createLinkResource('https://example.com/task');
      const original = await addTask(resource.id, {
        function: 'collect_url',
        input: { url: 'https://example.com/task', html: '<p>hello</p>' },
        status: TaskStatus.ERROR,
        exception: { error: 'boom' },
      });

      const response = await rerun(original.id).expect(HttpStatus.CREATED);

      expect(response.body.function).toBe('collect_url');
      expect(response.body.input.html_s3_key).toBeDefined();
      expect(response.body.input).not.toHaveProperty('html');
      expect(putObjectSpy).toHaveBeenCalledTimes(1);
    });
  });
});
