import { Expose } from 'class-transformer';
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
  SmartFolderOwnerScope,
  SmartFolderRootScope,
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
  @Expose({ name: 'match_mode' })
  matchMode?: SmartFolderMatchMode;

  @IsOptional()
  @IsEnum(SmartFolderOwnerScope, {
    message: i18nValidationMessage('validation.errors.isEnum'),
  })
  @Expose({ name: 'owner_scope' })
  ownerScope?: SmartFolderOwnerScope;

  @IsOptional()
  @IsEnum(SmartFolderRootScope, {
    message: i18nValidationMessage('validation.errors.isEnum'),
  })
  @Expose({ name: 'root_scope' })
  rootScope?: SmartFolderRootScope;

  @IsOptional()
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  conditions?: SmartFolderCondition[];
}
