import { HttpStatus } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { Task, TaskStatus } from 'omniboxd/tasks/tasks.entity';
import { TestClient } from 'test/test-client';
import { In, Repository } from 'typeorm';

describe('Resource task retry (e2e)', () => {
  let client: TestClient;
  let viewerClient: TestClient;
  let taskRepo: Repository<Task>;
  let resourceRepo: Repository<Resource>;
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
    return response.body;
  };

  const createLinkResource = async (url: string, content = '') => {
    const response = await client
      .post(`/api/v1/namespaces/${namespaceId()}/resources`)
      .send({
        name: uniqueName('Link'),
        resourceType: ResourceType.LINK,
        parentId: client.namespace.root_resource_id,
        content,
        attrs: { url },
      })
      .expect(HttpStatus.CREATED);
    return response.body;
  };

  const allTasks = async (resourceId: string) =>
    await taskRepo.find({
      where: { resourceId },
      order: { createdAt: 'DESC' },
    });

  const parseTasks = async (resourceId: string) =>
    (await allTasks(resourceId)).filter((task) =>
      task.function.startsWith('file_reader'),
    );

  const getResource = async (resourceId: string) =>
    await resourceRepo.findOneByOrFail({
      namespaceId: namespaceId(),
      id: resourceId,
    });

  const addTask = async (
    resourceId: string,
    overrides: Partial<Task>,
  ): Promise<Task> =>
    await taskRepo.save(
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

  /**
   * Creating a resource that already carries content emits the follow-up chain
   * (extract_tags, upsert_index, ...). No worker runs in the e2e environment,
   * so those stay pending and would make every retry a 409. Land them first
   * whenever the test is about something else.
   */
  const settlePendingTasks = async (resourceId: string) => {
    await taskRepo.update(
      { resourceId, status: In([TaskStatus.PENDING, TaskStatus.RUNNING]) },
      { status: TaskStatus.FINISHED, endedAt: new Date() },
    );
  };

  const retry = (resourceId: string) =>
    client.post(
      `/api/v1/namespaces/${namespaceId()}/resources/${resourceId}/retry`,
    );

  beforeAll(async () => {
    client = await TestClient.create();
    taskRepo = client.app.get<Repository<Task>>(getRepositoryToken(Task));
    resourceRepo = client.app.get<Repository<Resource>>(
      getRepositoryToken(Resource),
    );
  });

  afterAll(async () => {
    await viewerClient?.close();
    await client?.close();
  });

  it('marks a pro-only upload as failed and exposes it on the resource tasks endpoint', async () => {
    const resource = await createFileResource(
      'quota-exhausted.pdf',
      'application/pdf',
    );

    const response = await client
      .get(`/api/v1/namespaces/${namespaceId()}/resources/${resource.id}/tasks`)
      .expect(HttpStatus.OK);

    const readerTasks = (
      response.body as {
        function: string;
        status: string;
        retried_from_task_id: string | null;
      }[]
    ).filter((task) => task.function.startsWith('file_reader'));
    expect(readerTasks).toHaveLength(1);
    expect(readerTasks[0].function).toBe('file_reader_pdf');
    expect(readerTasks[0].status).toBe(TaskStatus.ERROR);
    expect(readerTasks[0].retried_from_task_id).toBeNull();
    expect((await getResource(resource.id)).content).toBe('');
  });

  it('re-emits the failed task pointing at it and clears the stale error content', async () => {
    const resource = await createFileResource('notes.txt', 'text/plain');
    const [task] = await parseTasks(resource.id);
    await taskRepo.update(task.id, {
      status: TaskStatus.INSUFFICIENT_QUOTA,
      endedAt: new Date(),
      exception: {
        type: 'InsufficientQuotaError',
        details: {
          code: 'INSUFFICIENT_QUOTA',
          usage_type: 'pdf',
          requested_amount: 12,
          limit_amount: 100,
          remaining_amount: 3,
        },
      } as Record<string, any>,
    });
    await resourceRepo.update(resource.id, {
      content: '当前 PDF 的页数为 12页，当前剩余额度为：3页',
    });

    const response = await retry(resource.id).expect(HttpStatus.CREATED);

    expect(response.body).toHaveLength(1);
    const [rerun] = response.body;
    expect(rerun.id).not.toBe(task.id);
    expect(rerun.function).toBe('file_reader_text');
    expect(rerun.status).toBe(TaskStatus.PENDING);
    expect(rerun.input).toEqual(task.input);
    expect(rerun.attrs.resource_id).toBe(resource.id);
    expect(rerun.retried_from_task_id).toBe(task.id);
    expect((await getResource(resource.id)).content).toBe('');
  });

  it('re-emits every failed task of the resource in one call', async () => {
    const resource = await createFileResource('multi.txt', 'text/plain');
    const [parse] = await parseTasks(resource.id);
    await taskRepo.update(parse.id, {
      status: TaskStatus.TIMEOUT,
      endedAt: new Date(),
      exception: { error: 'slow' } as Record<string, any>,
    });
    const tags = await addTask(resource.id, {
      function: 'extract_tags',
      status: TaskStatus.ERROR,
      exception: { error: 'boom' },
    });
    const index = await addTask(resource.id, {
      function: 'upsert_index',
      status: TaskStatus.TIMEOUT,
      exception: { error: 'slow' },
    });
    await addTask(resource.id, {
      function: 'generate_title',
      status: TaskStatus.FINISHED,
    });

    const response = await retry(resource.id).expect(HttpStatus.CREATED);

    const pointers = (
      response.body as { function: string; retried_from_task_id: string }[]
    )
      .map((task) => [task.function, task.retried_from_task_id])
      .sort();
    expect(pointers).toEqual(
      [
        ['file_reader_text', parse.id],
        ['extract_tags', tags.id],
        ['upsert_index', index.id],
      ].sort(),
    );
  });

  it('retries a failed non-parse task even when parsing succeeded', async () => {
    const resource = await createLinkResource(
      'https://example.com/tags',
      'real parsed markdown',
    );
    await settlePendingTasks(resource.id);
    await addTask(resource.id, {
      function: 'collect_url',
      status: TaskStatus.FINISHED,
    });
    const tags = await addTask(resource.id, {
      function: 'extract_tags',
      status: TaskStatus.ERROR,
      exception: { error: 'boom' },
    });

    const response = await retry(resource.id).expect(HttpStatus.CREATED);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].function).toBe('extract_tags');
    expect(response.body[0].retried_from_task_id).toBe(tags.id);
    // A non-parse retry never touches the body, stale or not
    expect((await getResource(resource.id)).content).toBe(
      'real parsed markdown',
    );
  });

  it('does not re-emit a failure that was already retried', async () => {
    const resource = await createLinkResource('https://example.com/once');
    const first = await addTask(resource.id, {
      function: 'collect_url',
      status: TaskStatus.ERROR,
      exception: { error: 'boom' },
    });

    const firstRetry = await retry(resource.id).expect(HttpStatus.CREATED);
    expect(firstRetry.body).toHaveLength(1);
    const second = firstRetry.body[0].id;
    expect(firstRetry.body[0].retried_from_task_id).toBe(first.id);

    await taskRepo.update(second, {
      status: TaskStatus.ERROR,
      endedAt: new Date(),
      exception: { error: 'boom again' } as Record<string, any>,
    });

    const secondRetry = await retry(resource.id).expect(HttpStatus.CREATED);

    expect(secondRetry.body).toHaveLength(1);
    expect(secondRetry.body[0].retried_from_task_id).toBe(second);
  });

  it('keeps real content when the resource already parsed successfully before failing', async () => {
    const resource = await createLinkResource(
      'https://example.com/kept',
      'real parsed markdown',
    );
    await settlePendingTasks(resource.id);
    await addTask(resource.id, {
      function: 'collect_url',
      input: { url: 'https://example.com/kept' },
      status: TaskStatus.ERROR,
      exception: { error: 'boom' },
    });

    await retry(resource.id).expect(HttpStatus.CREATED);

    expect((await getResource(resource.id)).content).toBe(
      'real parsed markdown',
    );
  });

  it('rejects a retry while a task is still pending', async () => {
    const resource = await createFileResource('pending.txt', 'text/plain');

    const response = await retry(resource.id).expect(HttpStatus.CONFLICT);
    expect(response.body.code).toBe('retry_already_running');
  });

  it('rejects a retry while a non-parse task is still running', async () => {
    const resource = await createFileResource('indexing.txt', 'text/plain');
    await settlePendingTasks(resource.id);
    const [parse] = await parseTasks(resource.id);
    await taskRepo.update(parse.id, {
      status: TaskStatus.ERROR,
      endedAt: new Date(),
      exception: { error: 'boom' } as Record<string, any>,
    });
    await addTask(resource.id, {
      function: 'upsert_index',
      status: TaskStatus.RUNNING,
      endedAt: null,
    });

    const response = await retry(resource.id).expect(HttpStatus.CONFLICT);
    expect(response.body.code).toBe('retry_already_running');
  });

  it('re-emits a file reader task for a blank file resource without tasks', async () => {
    const resource = await createFileResource('orphan.txt', 'text/plain');
    await taskRepo.delete({ resourceId: resource.id });

    const response = await retry(resource.id).expect(HttpStatus.CREATED);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].function).toBe('file_reader_text');
    expect(response.body[0].status).toBe(TaskStatus.PENDING);
    expect(response.body[0].input.resource_id).toBe(resource.id);
    // The fallback replaces nothing: there is no predecessor to point at
    expect(response.body[0].retried_from_task_id).toBeNull();
  });

  it('re-collects a blank link resource from its stored url', async () => {
    const resource = await createLinkResource('https://example.com/blank');

    const response = await retry(resource.id).expect(HttpStatus.CREATED);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].function).toBe('collect_url');
    expect(response.body[0].status).toBe(TaskStatus.PENDING);
    expect(response.body[0].input.url).toBe('https://example.com/blank');
  });

  it('rejects a retry when there is nothing to re-run', async () => {
    const resource = await createLinkResource(
      'https://example.com/done',
      'already parsed',
    );
    await settlePendingTasks(resource.id);

    const response = await retry(resource.id).expect(HttpStatus.CONFLICT);
    expect(response.body.code).toBe('retry_not_eligible');
  });

  it('re-emits a canceled task', async () => {
    const resource = await createLinkResource(
      'https://example.com/canceled',
      'already parsed',
    );
    await settlePendingTasks(resource.id);
    const canceled = await addTask(resource.id, {
      function: 'extract_tags',
      status: TaskStatus.CANCELED,
      canceledAt: new Date(),
    });

    const response = await retry(resource.id).expect(HttpStatus.CREATED);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].function).toBe('extract_tags');
    expect(response.body[0].status).toBe(TaskStatus.PENDING);
    expect(response.body[0].retried_from_task_id).toBe(canceled.id);
  });

  it('re-emits canceled and failed tasks together', async () => {
    const resource = await createFileResource('mixed.txt', 'text/plain');
    const [parse] = await parseTasks(resource.id);
    await taskRepo.update(parse.id, {
      status: TaskStatus.CANCELED,
      canceledAt: new Date(),
      endedAt: new Date(),
    });
    const tags = await addTask(resource.id, {
      function: 'extract_tags',
      status: TaskStatus.ERROR,
      exception: { error: 'boom' },
    });

    const response = await retry(resource.id).expect(HttpStatus.CREATED);

    const pointers = (
      response.body as { function: string; retried_from_task_id: string }[]
    )
      .map((task) => [task.function, task.retried_from_task_id])
      .sort();
    expect(pointers).toEqual(
      [
        ['file_reader_text', parse.id],
        ['extract_tags', tags.id],
      ].sort(),
    );
  });

  it('does not re-emit a canceled task that was already retried', async () => {
    const resource = await createLinkResource(
      'https://example.com/recancel',
      'already parsed',
    );
    await settlePendingTasks(resource.id);
    const canceled = await addTask(resource.id, {
      function: 'collect_url',
      status: TaskStatus.CANCELED,
      canceledAt: new Date(),
    });

    const first = await retry(resource.id).expect(HttpStatus.CREATED);
    expect(first.body).toHaveLength(1);
    expect(first.body[0].retried_from_task_id).toBe(canceled.id);
    await settlePendingTasks(resource.id);

    const response = await retry(resource.id).expect(HttpStatus.CONFLICT);
    expect(response.body.code).toBe('retry_not_eligible');
  });

  it('rejects a retry from a member with view permission only', async () => {
    viewerClient = await TestClient.create();
    const invitation = await client
      .post(`/api/v1/namespaces/${namespaceId()}/invitations`)
      .send({
        namespaceRole: 'member',
        rootPermission: ResourcePermission.CAN_VIEW,
      })
      .expect(HttpStatus.CREATED);
    await viewerClient
      .post(
        `/api/v1/namespaces/${namespaceId()}/invitations/${invitation.body.id}/accept`,
      )
      .expect(HttpStatus.CREATED);

    const resource = await createLinkResource('https://example.com/forbidden');

    await viewerClient
      .post(
        `/api/v1/namespaces/${namespaceId()}/resources/${resource.id}/retry`,
      )
      .expect(HttpStatus.FORBIDDEN);
  });

  it('retries through the internal endpoint used by the wizard tools', async () => {
    const resource = await createLinkResource('https://example.com/internal');

    const response = await client
      .request()
      .post(
        `/internal/api/v1/namespaces/${namespaceId()}/resources/${resource.id}/retry`,
      )
      .set('X-User-ID', client.user.id)
      .expect(HttpStatus.CREATED);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].function).toBe('collect_url');
    expect(response.body[0].status).toBe(TaskStatus.PENDING);
  });
});
