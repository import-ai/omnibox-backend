import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserinfoResponseDto {
  @ApiProperty({
    description:
      'Pairwise subject identifier - unique per user+client combination (for Laravel Passport compatibility)',
    example: 'Uakgb5m9g0Fa',
  })
  id: string;

  @ApiProperty({
    description:
      'Pairwise subject identifier - unique per user+client combination (OpenID Connect standard)',
    example: 'Uakgb5m9g0Fa',
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
