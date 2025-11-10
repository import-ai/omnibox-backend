import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { encodeFileName } from 'omniboxd/utils/encode-filename';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { MinioService } from 'omniboxd/minio/minio.service';
import { CookieAuth } from 'omniboxd/auth';
import { FeedbackResponseDto } from 'omniboxd/feedback/dto/feedback.dto';
import { AppException } from 'omniboxd/common/exceptions/app.exception';

@Controller('api/v1/feedback')
export class FeedbackController {
  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly minioService: MinioService,
  ) {}

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
          cb(
            new AppException(
              'Only image files are allowed',
              'ONLY_IMAGE_FILES_ALLOWED',
              HttpStatus.BAD_REQUEST,
            ),
            false,
          );
        }
      },
    }),
  )
  @CookieAuth({ onAuthFail: 'continue' })
  async createFeedback(
    @Body() createFeedbackDto: CreateFeedbackDto,
    @UploadedFile() image: Express.Multer.File,
    @Req() request: Request,
    @UserId({ optional: true }) userId?: string,
  ) {
    let imageUrl = '';

    if (image) {
      const originalname = encodeFileName(image.originalname);
      imageUrl = await this.minioService.put(
        originalname,
        image.buffer,
        image.mimetype,
        { folder: 'feedback' },
      );
    }

    const userAgent = request.get('User-Agent');

    return FeedbackResponseDto.fromEntity(
      await this.feedbackService.createFeedback(
        createFeedbackDto,
        imageUrl,
        userAgent,
        userId,
      ),
    );
  }
}
