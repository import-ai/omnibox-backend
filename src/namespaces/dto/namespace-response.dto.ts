import { IsNumber, IsOptional, IsString } from 'class-validator';
import { Namespace } from '../entities/namespace.entity';

export class NamespaceResponseDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsNumber()
  maxRunningTasks: number;

  @IsString()
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
