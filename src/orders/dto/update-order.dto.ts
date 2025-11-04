import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from 'omniboxd/orders/entities/order.entity';

export class UpdateOrderDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  thirdPartyOrderNo?: string;

  @IsOptional()
  metadata?: Record<string, any>;
}
