import { IsString, IsEnum } from 'class-validator';
import {
  PaymentMethod,
  PaymentType,
} from 'omniboxd/orders/entities/order.entity';

export class CreateOrderDto {
  @IsString()
  productId: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsEnum(PaymentType)
  paymentType: PaymentType;
}
