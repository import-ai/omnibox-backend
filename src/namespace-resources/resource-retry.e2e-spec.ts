import { HttpStatus } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { Task, TaskStatus } from 'omniboxd/tasks/tasks.entity';
import { TestClient } from 'test/test-client';
import { Repository } from 'typeorm';

describe('Resource parse retry (e2e)', () => {
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

  const parseTasks = async (resourceId: string) => {
    const tasks = await taskRepo.find({
      where: { resourceId },
      order: { createdAt: 'DESC' },
    });
    return tasks.filter((task) => task.function.startsWith('file_reader'));
  };

  const getResource = async (resourceId: string) =>
    await resourceRepo.findOneByOrFail({
      namespaceId: namespaceId(),
      id: resourceId,
    });

  const retryParse = (resourceId: string) =>
    client.post(
      `/api/v1/namespaces/${namespaceId()}/resources/${resourceId}/retry-parse`,
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
      response.body as { function: string; status: string }[]
    ).filter((task) => task.function.startsWith('file_reader'));
    expect(readerTasks).toHaveLength(1);
    expect(readerTasks[0].function).toBe('file_reader_pdf');
    expect(readerTasks[0].status).toBe(TaskStatus.ERROR);
    expect((await getResource(resource.id)).content).toBe('');
  });

  it('re-emits the failed task with the same input and clears the stale error content', async () => {
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

    const response = await retryParse(resource.id).expect(HttpStatus.CREATED);

    expect(response.body.id).not.toBe(task.id);
    expect(response.body.function).toBe('file_reader_text');
    expect(response.body.status).toBe(TaskStatus.PENDING);
    expect(response.body.input).toEqual(task.input);
    expect(response.body.attrs.resource_id).toBe(resource.id);
    expect((await getResource(resource.id)).content).toBe('');
  });

  it('keeps real content when the resource already parsed successfully before failing', async () => {
    const resource = await createLinkResource(
      'https://example.com/kept',
      'real parsed markdown',
    );
    await taskRepo.save(
      taskRepo.create({
        namespaceId: namespaceId(),
        userId: client.user.id,
        function: 'collect_url',
        input: { url: 'https://example.com/kept' },
        payload: { resource_id: resource.id },
        status: TaskStatus.ERROR,
        endedAt: new Date(),
        exception: { error: 'boom' },
      }),
    );

    await retryParse(resource.id).expect(HttpStatus.CREATED);

    expect((await getResource(resource.id)).content).toBe(
      'real parsed markdown',
    );
  });

  it('rejects a retry while a parse task is still pending', async () => {
    const resource = await createFileResource('pending.txt', 'text/plain');

    const response = await retryParse(resource.id).expect(HttpStatus.CONFLICT);
    expect(response.body.code).toBe('parse_already_running');
  });

  it('re-emits a file reader task for a blank file resource without tasks', async () => {
    const resource = await createFileResource('orphan.txt', 'text/plain');
    await taskRepo.delete({ resourceId: resource.id });

    const response = await retryParse(resource.id).expect(HttpStatus.CREATED);

    expect(response.body.function).toBe('file_reader_text');
    expect(response.body.status).toBe(TaskStatus.PENDING);
    expect(response.body.input.resource_id).toBe(resource.id);
  });

  it('re-collects a blank link resource from its stored url', async () => {
    const resource = await createLinkResource('https://example.com/blank');

    const response = await retryParse(resource.id).expect(HttpStatus.CREATED);

    expect(response.body.function).toBe('collect_url');
    expect(response.body.status).toBe(TaskStatus.PENDING);
    expect(response.body.input.url).toBe('https://example.com/blank');
  });

  it('rejects a retry when there is nothing to re-parse', async () => {
    const resource = await createLinkResource(
      'https://example.com/done',
      'already parsed',
    );

    const response = await retryParse(resource.id).expect(HttpStatus.CONFLICT);
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
        `/api/v1/namespaces/${namespaceId()}/resources/${resource.id}/retry-parse`,
      )
      .expect(HttpStatus.FORBIDDEN);
  });

  it('retries through the internal endpoint used by the wizard tools', async () => {
    const resource = await createLinkResource('https://example.com/internal');

    const response = await client
      .request()
      .post(
        `/internal/api/v1/namespaces/${namespaceId()}/resources/${resource.id}/retry-parse`,
      )
      .set('X-User-ID', client.user.id)
      .expect(HttpStatus.CREATED);

    expect(response.body.function).toBe('collect_url');
    expect(response.body.status).toBe(TaskStatus.PENDING);
  });
});
