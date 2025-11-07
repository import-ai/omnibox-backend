import { IsOptional, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { User } from '../entities/user.entity';

export class UserResponseDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.id.isString'),
  })
  id: string;

  @IsString({
    message: i18nValidationMessage('validation.errors.username.isString'),
  })
  @IsOptional()
  username: string | null;

  @IsString({
    message: i18nValidationMessage('validation.errors.email.isString'),
  })
  @IsOptional()
  email: string | null;

  created_at?: Date;

  updated_at?: Date;

  static fromEntity(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.username = user.username;
    dto.email = user.email;
    dto.created_at = user.createdAt;
    dto.updated_at = user.updatedAt;
    return dto;
  }
}
