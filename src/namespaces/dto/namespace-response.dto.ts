import { IsNumber, IsOptional, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { Namespace } from '../entities/namespace.entity';

export class NamespaceResponseDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.id.isString'),
  })
  id: string;

  @IsString({
    message: i18nValidationMessage('validation.errors.name.isString'),
  })
  name: string;

  @IsNumber(
    {},
    {
      message: i18nValidationMessage(
        'validation.errors.maxRunningTasks.isNumber',
      ),
    },
  )
  maxRunningTasks: number;

  @IsString({
    message: i18nValidationMessage('validation.errors.rootResourceId.isString'),
  })
  @IsOptional()
  rootResourceId: string | null;

  createdAt: Date;

  updatedAt: Date;

  static fromEntity(namespace: Namespace): NamespaceResponseDto {
    const dto = new NamespaceResponseDto();
    dto.id = namespace.id;
    dto.name = namespace.name;
    dto.maxRunningTasks = namespace.maxRunningTasks;
    dto.rootResourceId = namespace.rootResourceId;
    dto.createdAt = namespace.createdAt;
    dto.updatedAt = namespace.updatedAt;
    return dto;
  }
}
