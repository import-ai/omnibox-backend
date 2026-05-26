import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  ValidateNested,
} from 'class-validator';

export interface ConversationPreferences {
  tools?: Array<{ name: 'web_search' }>;
  enable_thinking?: boolean;
}

export class WebSearchPreferenceToolDto {
  @IsIn(['web_search'])
  name: 'web_search';
}

export class ConversationPreferencesDto implements ConversationPreferences {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WebSearchPreferenceToolDto)
  tools?: WebSearchPreferenceToolDto[];

  @IsOptional()
  @IsBoolean()
  enable_thinking?: boolean;
}
