import {
  IsEmail,
  IsNumber,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsStrongPassword,
} from 'class-validator';

export class UpdateUserDto {
  @IsNumber()
  user_id: number;

  @IsString()
  @MinLength(4)
  @MaxLength(32)
  @IsOptional()
  username: string;

  @IsEmail()
  @IsOptional()
  email: string;

  @IsStrongPassword({ minLength: 8 })
  @IsOptional()
  password: string;

  @IsStrongPassword({ minLength: 8 })
  @IsOptional()
  password_repeat: string;
}
