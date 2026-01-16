import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserinfoResponseDto {
  @ApiProperty({
    description: 'User ID (for Laravel Passport compatibility)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Subject identifier (user ID) - OpenID Connect standard',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  sub: string;

  @ApiProperty({
    description: 'User display name',
    example: 'johndoe',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'User email address',
    example: 'user@example.com',
  })
  email?: string;
}
