import { Controller, Delete, Get, Param, Query } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { FeedbackResponseDto } from 'omniboxd/feedback/dto/feedback.dto';

@Controller('internal/api/v1/feedback')
export class InternalFeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Get()
  @Public()
  async findAll(@Query('userId') userId?: string) {
    return (await this.feedbackService.findAll(userId)).map((feedback) =>
      FeedbackResponseDto.fromEntity(feedback),
    );
  }

  @Get(':id')
  @Public()
  async findOne(@Param('id') id: string) {
    return FeedbackResponseDto.fromEntity(
      await this.feedbackService.findOne(+id),
    );
  }

  @Delete(':id')
  @Public()
  async remove(@Param('id') id: string) {
    await this.feedbackService.remove(+id);
    return { message: 'Feedback deleted successfully' };
  }
}
