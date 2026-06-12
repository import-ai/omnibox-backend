import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { TagService } from 'omniboxd/tag/tag.service';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { TasksService } from 'omniboxd/tasks/tasks.service';
import { WizardTaskService } from 'omniboxd/tasks/wizard-task.service';
import { UserService } from 'omniboxd/user/user.service';

describe('WizardTaskService', () => {
  let service: WizardTaskService;
  let userService: jest.Mocked<Pick<UserService, 'listOption'>>;
  let tasksService: jest.Mocked<Pick<TasksService, 'emitTask'>>;

  const mockResource = {
    id: 'resource-1',
    namespaceId: 'namespace-1',
    userId: 'user-1',
    name: 'Example File',
    attrs: {
      original_name: 'example.pdf',
      filename: 'stored-example.pdf',
      mimetype: 'application/pdf',
    },
  } as unknown as Resource;

  beforeEach(async () => {
    const mockTaskRepository = {};
    const mockUserService = {
      listOption: jest.fn(),
    };
    const mockTasksService = {
      emitTask: jest.fn(),
    };
    const mockTagService = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WizardTaskService,
        {
          provide: getRepositoryToken(Task),
          useValue: mockTaskRepository,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: TasksService,
          useValue: mockTasksService,
        },
        {
          provide: TagService,
          useValue: mockTagService,
        },
      ],
    }).compile();

    service = module.get(WizardTaskService);
    userService = module.get(UserService);
    tasksService = module.get(TasksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('emitFileReaderTask', () => {
    it('passes the user language option in task input', async () => {
      userService.listOption.mockResolvedValue([
        { name: 'language', value: 'en-US' },
        { name: 'theme', value: 'dark' },
      ] as any);
      tasksService.emitTask.mockResolvedValue({ id: 'task-1' } as Task);

      await service.emitFileReaderTask('user-1', mockResource, 'upload');

      expect(tasksService.emitTask).toHaveBeenCalledWith(
        {
          function: 'file_reader_pdf',
          input: {
            title: 'Example File',
            original_name: 'example.pdf',
            filename: 'stored-example.pdf',
            mimetype: 'application/pdf',
            resource_id: 'resource-1',
            language: 'en-US',
          },
          payload: {
            resource_id: 'resource-1',
            source: 'upload',
            user: {
              options: {
                language: 'en-US',
                theme: 'dark',
              },
            },
          },
          namespaceId: 'namespace-1',
          userId: 'user-1',
        },
        undefined,
      );
    });

    it('omits language from task input when the option is unavailable', async () => {
      userService.listOption.mockResolvedValue([
        { name: 'theme', value: 'dark' },
      ] as any);
      tasksService.emitTask.mockResolvedValue({ id: 'task-1' } as Task);

      await service.emitFileReaderTask('user-1', mockResource);

      expect(tasksService.emitTask).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            title: 'Example File',
            original_name: 'example.pdf',
            filename: 'stored-example.pdf',
            mimetype: 'application/pdf',
            resource_id: 'resource-1',
          },
        }),
        undefined,
      );
    });
  });
});
