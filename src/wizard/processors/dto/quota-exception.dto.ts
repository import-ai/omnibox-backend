import { Expose } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class QuotaExceptionDetailsDto {
  @Expose({ name: 'code' })
  @IsString()
  code: string;

  @Expose({ name: 'usage_type' })
  @IsString()
  usageType: string;

  @Expose({ name: 'requested_amount' })
  @IsInt()
  requestedAmount: number;

  @Expose({ name: 'limit_amount' })
  @IsOptional()
  @IsInt()
  limitAmount?: number;

  @Expose({ name: 'remaining_amount' })
  @IsOptional()
  @IsInt()
  remainingAmount?: number;
}
