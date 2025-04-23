import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsStrongPassword,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  username: string;

  @IsEmail()
  email: string;

  @IsStrongPassword({ minLength: 8 })
  password: string;

  @IsStrongPassword({ minLength: 8 })
  password_repeat: string;
}
