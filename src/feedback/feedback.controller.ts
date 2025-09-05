import {
  Req,
  Post,
  Body,
  Controller,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { encodeFileName } from 'omniboxd/utils/encode-filename';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { MinioService } from 'omniboxd/minio/minio.service';

@Controller('api/v1/feedback')
export class FeedbackController {
  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly minioService: MinioService,
  ) {}

  @Public()
  @Post()
  @UseInterceptors(
    FileInterceptor('image', {
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
      fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only image files are allowed'), false);
        }
      },
    }),
  )
  async createFeedback(
    @Body() createFeedbackDto: CreateFeedbackDto,
    @UploadedFile() image: Express.Multer.File,
    @Req() request: Request,
    @UserId({ optional: true }) userId?: string,
  ) {
    let imageUrl = '';

    if (image) {
      const originalname = encodeFileName(image.originalname);
      const uploadResult = await this.minioService.put(
        originalname,
        image.buffer,
        image.mimetype,
        { folder: 'feedback' },
      );
      imageUrl = uploadResult.id;
    }

    const userAgent = request.get('User-Agent');

    return this.feedbackService.createFeedback(
      createFeedbackDto,
      imageUrl,
      userAgent,
      userId,
    );
  }
}
