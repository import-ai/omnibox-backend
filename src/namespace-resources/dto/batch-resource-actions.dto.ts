import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class BatchResourceIdsDto {
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({
    each: true,
    message: i18nValidationMessage('validation.errors.isString'),
  })
  resourceIds: string[];
}

export class BatchMoveResourcesDto extends BatchResourceIdsDto {
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  targetId: string;
}

export class BatchCreateFolderDto extends BatchResourceIdsDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.name.isString'),
  })
  @MaxLength(128, {
    message: i18nValidationMessage('validation.errors.name.maxLength'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.name.isNotEmpty'),
  })
  name: string;

  @IsString({
    message: i18nValidationMessage('validation.errors.parentId.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.parentId.isNotEmpty'),
  })
  parentId: string;
}
