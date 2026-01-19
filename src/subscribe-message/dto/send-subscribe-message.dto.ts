import { Expose } from 'class-transformer';
import { IsString, IsOptional, IsObject, IsEnum } from 'class-validator';

export enum MiniProgramState {
  DEVELOPER = 'developer',
  TRIAL = 'trial',
  FORMAL = 'formal',
}

export class SendSubscribeMessageDto {
  @IsString()
  @Expose({ name: 'user_id' })
  userId: string;

  @IsString()
  @Expose({ name: 'template_id' })
  templateId: string;

  @IsObject()
  data: Record<string, { value: string }>;

  @IsOptional()
  @IsString()
  @Expose({ name: 'resource_id' })
  resourceId?: string;

  @IsOptional()
  @IsString()
  @Expose({ name: 'namespace_id' })
  namespaceId?: string;

  @IsString()
  @Expose({ name: 'title' })
  title?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @Expose({ name: 'miniprogram_state' })
  @IsEnum(MiniProgramState)
  miniprogram_state?: MiniProgramState;

  @IsOptional()
  @IsString()
  lang?: string;
}
