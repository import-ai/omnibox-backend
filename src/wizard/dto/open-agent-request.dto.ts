import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  PrivateSearchToolDto,
  WebSearchToolDto,
} from 'omniboxd/wizard/dto/agent-request.dto';

export class OpenAgentImageDto {
  @ApiProperty({
    description: 'Conversation attachment ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID(undefined, {
    message: i18nValidationMessage('validation.errors.isUUID'),
  })
  attachment_id: string;

  @ApiProperty({
    description: 'Attachment preview URL (a relative URL is allowed)',
    example:
      '/api/v1/namespaces/550e8400-e29b-41d4-a716-446655440000/conversations/6ba7b810-9dad-41d1-80b4-00c04fd430c8/attachments/6ba7b811-9dad-41d1-80b4-00c04fd430c8',
  })
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  url: string;

  @ApiProperty({ description: 'Original file name', example: 'image.jpg' })
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  name: string;
}

export class OpenAgentRequestDto {
  @ApiProperty({
    description: 'Question to ask the AI wizard',
    example: 'What are the main topics discussed in my recent articles?',
  })
  @IsString({
    message: i18nValidationMessage('validation.errors.query.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.query.isNotEmpty'),
  })
  query: string;

  @ApiProperty({
    description: 'Tools available to the AI assistant',
    type: 'array',
    items: { type: 'object' },
  })
  tools: Array<PrivateSearchToolDto | WebSearchToolDto>;

  @ApiPropertyOptional({
    description: 'Enable thinking/reasoning mode. Defaults to false.',
    example: true,
  })
  @IsOptional()
  @IsBoolean({ message: i18nValidationMessage('validation.errors.isBoolean') })
  enable_thinking?: boolean;

  @ApiPropertyOptional({
    description: 'Response language.',
    enum: ['简体中文', 'English'],
    example: 'English',
  })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  lang?: '简体中文' | 'English';

  @ApiPropertyOptional({
    description:
      'Continue this conversation. Without parent_message_id, the new message follows the latest message in the conversation.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID(undefined, {
    message: i18nValidationMessage('validation.errors.isUUID'),
  })
  conversation_id?: string;

  @ApiPropertyOptional({
    description:
      'Parent message ID for conversation threading. Must belong to the current API key user and namespace. When both this and conversation_id are set, this parent is used.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID(undefined, {
    message: i18nValidationMessage('validation.errors.isUUID'),
  })
  parent_message_id?: string;

  @ApiPropertyOptional({
    description:
      'Messaging channel the user sent from, such as qq, wechat, or telegram. Stored on the user message so clients can show where it came from.',
    example: 'qq',
  })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  source_channel?: string;

  @ApiPropertyOptional({
    description:
      'Images attached to the question; each must be an uploaded conversation attachment.',
    type: () => [OpenAgentImageDto],
  })
  @IsOptional()
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @ValidateNested({ each: true })
  @Type(() => OpenAgentImageDto)
  images?: OpenAgentImageDto[];
}

export class OpenConversationMessageDto extends OpenAgentRequestDto {
  @IsUUID()
  client_request_id: string;
}
