import {
  Body,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';

import {
  OnboardingTranscribeDto,
  OnboardingTranscribeResponseDto,
} from './dto/onboarding-transcribe.dto';
import { OnboardingRecordingService } from './onboarding-recording.service';

@Public()
@Controller('api/v1/onboarding/recordings')
export class OnboardingRecordingController {
  constructor(private readonly service: OnboardingRecordingService) {}

  @Post('transcribe')
  @UseInterceptors(
    FileInterceptor('audio', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  transcribe(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() input: OnboardingTranscribeDto,
    @Req() request: Request,
  ): Promise<OnboardingTranscribeResponseDto> {
    return this.service.transcribe(file, input, request.ip ?? 'unknown');
  }
}
