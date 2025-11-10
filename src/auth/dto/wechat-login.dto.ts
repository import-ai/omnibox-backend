import { IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class WechatCheckResponseDto {
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  status: 'pending' | 'success' | 'expired';

  user?: {
    id: string;
    access_token: string;
  };
}
