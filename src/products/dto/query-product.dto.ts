import { IsEnum, IsOptional } from 'class-validator';
import {
  ProductStatus,
  ProductType,
} from 'omniboxd/products/entities/product.entity';

export class QueryProductDto {
  @IsEnum(ProductStatus)
  @IsOptional()
  status?: ProductStatus;

  @IsEnum(ProductType)
  @IsOptional()
  type?: ProductType;
}
