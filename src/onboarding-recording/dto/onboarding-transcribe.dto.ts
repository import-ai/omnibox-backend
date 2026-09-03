import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsString, Length, Max, Min } from 'class-validator';

export class OnboardingTranscribeDto {
  @IsString()
  @Length(16, 128)
  sessionId!: string;

  @IsIn(['zh-CN', 'en-US'])
  locale: 'zh-CN' | 'en-US' = 'zh-CN';

  @IsInt()
  @Min(0)
  @Max(15)
  @Transform(({ value }) => Number(value))
  durationSeconds = 0;
}

export class OnboardingTranscribeResponseDto {
  transcript!: string;
  requestId!: string;
}
