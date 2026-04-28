import {
  IsArray,
  IsEnum,
  IsNotEmpty,
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

export class CreateSmartFolderRequestDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.name.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.name.isNotEmpty'),
  })
  @MaxLength(128, {
    message: i18nValidationMessage('validation.errors.name.maxLength'),
  })
  name: string;

  @IsOptional()
  @IsString({
    message: i18nValidationMessage('validation.errors.parentId.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.parentId.isNotEmpty'),
  })
  parentId?: string;

  @IsOptional()
  @IsEnum(SmartFolderOwnerScope, {
    message: i18nValidationMessage('validation.errors.isEnum'),
  })
  ownerScope?: SmartFolderOwnerScope;

  @IsEnum(SmartFolderRootScope, {
    message: i18nValidationMessage('validation.errors.isEnum'),
  })
  rootScope: SmartFolderRootScope;

  @IsOptional()
  @IsEnum(SmartFolderMatchMode, {
    message: i18nValidationMessage('validation.errors.isEnum'),
  })
  matchMode?: SmartFolderMatchMode;

  @IsOptional()
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  conditions?: SmartFolderCondition[];
}
