import { Injectable, HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Feedback } from './entities/feedback.entity';
import { CreateFeedbackDto } from './dto/create-feedback.dto';

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(Feedback)
    private readonly feedbackRepository: Repository<Feedback>,
    private readonly i18n: I18nService,
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

    return await this.feedbackRepository.save(feedback);
  }

  async findAll(userId?: string): Promise<Feedback[]> {
    const where = userId ? { userId } : {};
    return await this.feedbackRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Feedback> {
    const feedback = await this.feedbackRepository.findOne({ where: { id } });
    if (!feedback) {
      const message = this.i18n.t('feedback.errors.feedbackNotFound', {
        args: { id },
      });
      throw new AppException(
        message,
        'FEEDBACK_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return feedback;
  }

  async remove(id: number): Promise<void> {
    const feedback = await this.findOne(id);
    await this.feedbackRepository.remove(feedback);
  }
}
