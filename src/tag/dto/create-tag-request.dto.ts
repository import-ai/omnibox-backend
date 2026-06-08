import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateTagRequestDto {
  @ApiProperty({
    description: 'Tag name',
    example: 'project',
    maxLength: 20,
  })
  @IsString({
    message: i18nValidationMessage('validation.errors.name.isString'),
  })
  @MaxLength(20, {
    message: i18nValidationMessage('validation.errors.name.maxLength'),
  })
  name: string;
}
