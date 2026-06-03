import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class OpenResourceTagDto {
  @ApiProperty({
    description: 'Tag name to add to the resource',
    example: 'project',
    maxLength: 20,
  })
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  @MaxLength(20, {
    message: i18nValidationMessage('validation.errors.name.maxLength'),
  })
  tag_name: string;
}
