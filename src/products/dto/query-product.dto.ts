import { IsEnum, IsOptional, IsInt, Min } from 'class-validator';
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

  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;
}
