import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Task, TaskStatus } from 'omniboxd/tasks/tasks.entity';
import { TasksService } from 'omniboxd/tasks/tasks.service';
import { TestClient } from 'test/test-client';
import { Repository } from 'typeorm';

describe('Task schedule limit (e2e)', () => {
  let client: TestClient;
  let tasksService: TasksService;
  let taskRepo: Repository<Task>;
  let maxRetries: number;

  const staleHeartbeat = () => new Date(Date.now() - 60_000);
  const cutoff = () => new Date(Date.now() - 10_000);

  const insertTask = async (overrides: Partial<Task>): Promise<Task> =>
    taskRepo.save(
      taskRepo.create({
        namespaceId: client.namespace.id,
        userId: client.user.id,
        priority: '5',
        function: 'file_reader_pdf',
        input: {},
        status: TaskStatus.PENDING,
        ...overrides,
      }),
    );

  beforeAll(async () => {
    client = await TestClient.create();
    tasksService = client.app.get(TasksService);
    taskRepo = client.app.get<Repository<Task>>(getRepositoryToken(Task));
    maxRetries = parseInt(
      client.app.get(ConfigService).get<string>('OBB_TASK_MAX_RETRIES', '3'),
      10,
    );
  });

  afterAll(async () => {
    await client.close();
  });

  it('increments num_schedules atomically on each claim', async () => {
    const task = await insertTask({
      status: TaskStatus.RUNNING,
      lastHeartbeat: staleHeartbeat(),
      numSchedules: 0,
    });

    const claimed = await tasksService.claimTask(task.id, cutoff(), 'worker-a');
    expect(claimed).not.toBeNull();
    expect(claimed!.numSchedules).toBe(1);
    expect(claimed!.workerId).toBe('worker-a');
  });

  it('allows the final schedule at the cap, then refuses beyond it', async () => {
    const task = await insertTask({
      status: TaskStatus.RUNNING,
      lastHeartbeat: staleHeartbeat(),
      numSchedules: maxRetries,
    });

    const lastClaim = await tasksService.claimTask(
      task.id,
      cutoff(),
      'worker-b',
    );
    expect(lastClaim).not.toBeNull();
    expect(lastClaim!.numSchedules).toBe(maxRetries + 1);

    await taskRepo.update(task.id, { lastHeartbeat: staleHeartbeat() });
    const overClaim = await tasksService.claimTask(
      task.id,
      cutoff(),
      'worker-c',
    );
    expect(overClaim).toBeNull();
  });

  it('reaper fails a stale task that exhausted its schedules; leaves an in-budget one', async () => {
    const exhausted = await insertTask({
      status: TaskStatus.RUNNING,
      lastHeartbeat: staleHeartbeat(),
      numSchedules: maxRetries + 1,
    });
    const inBudget = await insertTask({
      status: TaskStatus.RUNNING,
      lastHeartbeat: staleHeartbeat(),
      numSchedules: maxRetries,
    });

    const failed = await tasksService.failTasksExceedingScheduleLimit();
    expect(failed).toBeGreaterThanOrEqual(1);

    const reaped = await taskRepo.findOneByOrFail({ id: exhausted.id });
    expect(reaped.status).toBe(TaskStatus.ERROR);
    expect(reaped.endedAt).not.toBeNull();
    expect(reaped.exception).toMatchObject({ type: 'ScheduleLimitExceeded' });

    const untouched = await taskRepo.findOneByOrFail({ id: inBudget.id });
    expect(untouched.status).toBe(TaskStatus.RUNNING);
  });

  it('getNextTaskV2 skips exhausted and terminal tasks', async () => {
    const exhausted = await insertTask({
      status: TaskStatus.RUNNING,
      lastHeartbeat: staleHeartbeat(),
      numSchedules: maxRetries + 1,
    });
    const errored = await insertTask({
      status: TaskStatus.ERROR,
      lastHeartbeat: staleHeartbeat(),
      numSchedules: 1,
    });

    for (let i = 0; i < 10; i++) {
      const next = await tasksService.getNextTaskV2(
        ['file_reader_pdf'],
        cutoff(),
      );
      expect(next?.id).not.toBe(exhausted.id);
      expect(next?.id).not.toBe(errored.id);
    }
  });
});
