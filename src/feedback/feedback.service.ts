import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Feedback } from './entities/feedback.entity';
import { CreateFeedbackDto } from './dto/create-feedback.dto';

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(Feedback)
    private readonly feedbackRepository: Repository<Feedback>,
  ) {}

  async createFeedback(
    createFeedbackDto: CreateFeedbackDto,
    imageUrl?: string,
    userAgent?: string,
    userId?: string,
  ) {
    const feedback = this.feedbackRepository.create({
      type: createFeedbackDto.type,
      description: createFeedbackDto.description,
      contactInfo: createFeedbackDto.contactInfo,
      imageUrl,
      userAgent,
      userId,
    });

    await this.feedbackRepository.save(feedback);
  }
}
