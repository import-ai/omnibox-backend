import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { MAX_TAG_NAME_LENGTH } from 'omniboxd/tag/tag.constants';

export class OpenAddResourceTagRequestDto {
  @ApiProperty({
    description: 'Tag name to add to the resource',
    example: 'project',
    maxLength: MAX_TAG_NAME_LENGTH,
  })
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  @MaxLength(MAX_TAG_NAME_LENGTH, {
    message: i18nValidationMessage('validation.errors.name.maxLength'),
  })
  tag_name: string;
}
