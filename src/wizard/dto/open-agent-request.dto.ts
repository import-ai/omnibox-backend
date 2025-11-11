import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  PrivateSearchToolDto,
  WebSearchToolDto,
} from 'omniboxd/wizard/dto/agent-request.dto';

export class OpenAgentRequestDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.query.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.query.isNotEmpty'),
  })
  query: string;

  tools: Array<PrivateSearchToolDto | WebSearchToolDto>;

  @IsOptional()
  @IsBoolean({ message: i18nValidationMessage('validation.errors.isBoolean') })
  enable_thinking?: boolean;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  lang?: '简体中文' | 'English';

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  parent_message_id?: string;
}
