import { IsString, IsNumber, IsEnum, IsOptional, Min } from 'class-validator';
import {
  PaymentMethod,
  PaymentType,
} from 'omniboxd/orders/entities/order.entity';

export class CreateOrderDto {
  @IsString()
  productId: string;

  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  description: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsEnum(PaymentType)
  paymentType: PaymentType;

  @IsOptional()
  metadata?: Record<string, any>;
}
