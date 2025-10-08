import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import {
  PrivateSearchToolDto,
  WebSearchToolDto,
} from 'omniboxd/wizard/dto/agent-request.dto';

export class OpenAgentRequestDto {
  @IsString()
  @IsNotEmpty()
  query: string;

  tools: Array<PrivateSearchToolDto | WebSearchToolDto>;

  @IsOptional()
  @IsBoolean()
  enable_thinking?: boolean;

  @IsOptional()
  @IsString()
  lang?: '简体中文' | 'English';

  @IsOptional()
  @IsString()
  parent_message_id?: string;
}
