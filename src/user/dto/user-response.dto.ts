import { IsOptional, IsString } from 'class-validator';
import { User } from '../entities/user.entity';

export class UserResponseDto {
  @IsString()
  id: string;

  @IsString()
  @IsOptional()
  username: string | null;

  @IsString()
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
