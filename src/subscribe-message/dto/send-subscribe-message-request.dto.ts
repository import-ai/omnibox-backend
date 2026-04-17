import { Expose } from 'class-transformer';
import { IsString, IsOptional, IsObject } from 'class-validator';

export class SendSubscribeMessageRequestDto {
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
  resourceId: string;

  @IsOptional()
  @IsString()
  @Expose({ name: 'namespace_id' })
  namespaceId: string;

  @IsString()
  @Expose({ name: 'title' })
  title: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  lang?: string;
}
