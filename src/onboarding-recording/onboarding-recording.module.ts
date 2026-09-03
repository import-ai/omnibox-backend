import { Module } from '@nestjs/common';

import { OnboardingRecordingController } from './onboarding-recording.controller';
import { OnboardingRecordingService } from './onboarding-recording.service';

@Module({
  controllers: [OnboardingRecordingController],
  providers: [OnboardingRecordingService],
})
export class OnboardingRecordingModule {}
