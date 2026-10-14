import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  PrivateSearchToolDto,
  WebSearchToolDto,
} from 'omniboxd/wizard/dto/agent-request.dto';

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
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  conversation_id?: string;

  @ApiPropertyOptional({
    description:
      'Parent message ID for conversation threading. Must belong to the current API key user and namespace. When both this and conversation_id are set, this parent is used.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  parent_message_id?: string;
}
