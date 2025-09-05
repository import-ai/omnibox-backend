import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FeedbackService } from './feedback.service';
import { Feedback, FeedbackType } from './entities/feedback.entity';
import { CreateFeedbackDto } from './dto/create-feedback.dto';

const mockFeedbackRepository = {
  create: jest.fn(),
  save: jest.fn(),
};

describe('FeedbackService', () => {
  let service: FeedbackService;

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

      await service.createFeedback(createFeedbackDto, undefined, 'Mozilla/5.0');

      expect(mockFeedbackRepository.create).toHaveBeenCalledWith({
        type: createFeedbackDto.type,
        description: createFeedbackDto.description,
        contactInfo: createFeedbackDto.contactInfo,
        imageUrl: undefined,
        userAgent: 'Mozilla/5.0',
        userId: undefined,
      });
      expect(mockFeedbackRepository.save).toHaveBeenCalledWith(mockFeedback);
    });
  });
});
