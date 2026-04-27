import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  SmartFolderCondition,
  SmartFolderMatchMode,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';

export class UpdateSmartFolderRequestDto {
  @IsOptional()
  @IsString({
    message: i18nValidationMessage('validation.errors.name.isString'),
  })
  @MaxLength(128, {
    message: i18nValidationMessage('validation.errors.name.maxLength'),
  })
  name?: string;

  @IsOptional()
  @IsEnum(SmartFolderMatchMode, {
    message: i18nValidationMessage('validation.errors.isEnum'),
  })
  matchMode?: SmartFolderMatchMode;

  @IsOptional()
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  conditions?: SmartFolderCondition[];
}
