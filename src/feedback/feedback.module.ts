import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { Feedback } from './entities/feedback.entity';
import { S3Module } from 'omniboxd/s3/s3.module';
import { InternalFeedbackController } from 'omniboxd/feedback/internal.feedback.controller';

@Module({
  imports: [S3Module, TypeOrmModule.forFeature([Feedback])],
  controllers: [FeedbackController, InternalFeedbackController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
