import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { MAX_TAG_NAME_LENGTH } from 'omniboxd/tag/tag.constants';

export class CreateTagRequestDto {
  @ApiProperty({
    description: 'Tag name',
    example: 'project',
    maxLength: MAX_TAG_NAME_LENGTH,
  })
  @IsString({
    message: i18nValidationMessage('validation.errors.name.isString'),
  })
  @MaxLength(MAX_TAG_NAME_LENGTH, {
    message: i18nValidationMessage('validation.errors.name.maxLength'),
  })
  name: string;
}
