import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeedbackService } from './feedback.service';
import { Feedback, FeedbackType } from './entities/feedback.entity';
import { CreateFeedbackDto } from './dto/create-feedback.dto';

const mockFeedbackRepository = {
  create: jest.fn(),
  save: jest.fn(),
  findAndCount: jest.fn(),
  findOne: jest.fn(),
};

describe('FeedbackService', () => {
  let service: FeedbackService;
  let repository: Repository<Feedback>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackService,
        {
          provide: getRepositoryToken(Feedback),
          useValue: mockFeedbackRepository,
        },
      ],
    }).compile();

    service = module.get<FeedbackService>(FeedbackService);
    repository = module.get<Repository<Feedback>>(getRepositoryToken(Feedback));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createFeedback', () => {
    it('should create feedback successfully', async () => {
      const createFeedbackDto: CreateFeedbackDto = {
        type: FeedbackType.BUG,
        description: 'Test bug report',
        contactInfo: 'test@example.com',
      };

      const mockFeedback = {
        id: '1',
        ...createFeedbackDto,
        imageUrl: null,
        userAgent: 'Mozilla/5.0',
        userId: null,
        user: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFeedbackRepository.create.mockReturnValue(mockFeedback);
      mockFeedbackRepository.save.mockResolvedValue(mockFeedback);

      const result = await service.createFeedback(
        createFeedbackDto,
        undefined,
        'Mozilla/5.0',
      );

      expect(repository.create).toHaveBeenCalledWith({
        type: createFeedbackDto.type,
        description: createFeedbackDto.description,
        contactInfo: createFeedbackDto.contactInfo,
        imageUrl: undefined,
        userAgent: 'Mozilla/5.0',
        userId: undefined,
        user: undefined,
      });
      expect(repository.save).toHaveBeenCalledWith(mockFeedback);
      expect(result).toEqual(expect.objectContaining({
        id: '1',
        type: FeedbackType.BUG,
        description: 'Test bug report',
      }));
    });
  });

  describe('findAll', () => {
    it('should return paginated feedback list', async () => {
      const mockFeedbacks = [
        {
          id: '1',
          type: FeedbackType.BUG,
          description: 'Bug 1',
          createdAt: new Date(),
        },
        {
          id: '2',
          type: FeedbackType.FEATURE_REQUEST,
          description: 'Feature request 1',
          createdAt: new Date(),
        },
      ];

      mockFeedbackRepository.findAndCount.mockResolvedValue([mockFeedbacks, 2]);

      const result = await service.findAll(1, 10);

      expect(repository.findAndCount).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        order: { createdAt: 'DESC' },
        relations: ['user'],
      });
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });
  });

  describe('findById', () => {
    it('should return feedback by id', async () => {
      const mockFeedback = {
        id: '1',
        type: FeedbackType.BUG,
        description: 'Test bug',
        createdAt: new Date(),
      };

      mockFeedbackRepository.findOne.mockResolvedValue(mockFeedback);

      const result = await service.findById('1');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: '1' },
        relations: ['user'],
      });
      expect(result).toEqual(expect.objectContaining({
        id: '1',
        type: FeedbackType.BUG,
      }));
    });

    it('should return null if feedback not found', async () => {
      mockFeedbackRepository.findOne.mockResolvedValue(null);

      const result = await service.findById('nonexistent');

      expect(result).toBeNull();
    });
  });
});