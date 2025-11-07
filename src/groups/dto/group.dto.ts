import { IsNotEmpty, IsString } from 'class-validator';
import { Expose } from 'class-transformer';
import { i18nValidationMessage } from 'nestjs-i18n';

export class GroupDto {
  @Expose()
  @IsString({
    message: i18nValidationMessage('validation.errors.id.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.id.isNotEmpty'),
  })
  id: string;

  @Expose()
  @IsString({
    message: i18nValidationMessage('validation.errors.namespaceId.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.namespaceId.isNotEmpty'),
  })
  @Expose({ name: 'namespace_id' })
  namespaceId: string;

  @Expose()
  @IsString({
    message: i18nValidationMessage('validation.errors.title.isString'),
  })
  title: string;

  @Expose()
  @IsString({
    message: i18nValidationMessage('validation.errors.invitationId.isString'),
  })
  invitationId?: string;
}
