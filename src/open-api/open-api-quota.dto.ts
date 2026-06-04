import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class OpenAPIRequestsQuotaDto {
  @ApiProperty({ description: 'Requests per 24h limit. 0 means unlimited.' })
  limit: number;

  @ApiProperty({ description: 'Requests used in the current rolling window.' })
  used: number;

  @ApiProperty({
    description:
      'Requests remaining in the current rolling window. Null means unlimited.',
    nullable: true,
  })
  remaining: number | null;

  @ApiProperty({
    description:
      'Current rolling window reset time. Null when no window is active or quota is unlimited.',
    nullable: true,
  })
  @Expose({ name: 'reset_at' })
  resetAt: Date | null;
}
