import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  Min,
  IsInt,
} from 'class-validator';
import {
  ProductStatus,
  ProductType,
} from 'omniboxd/products/entities/product.entity';

export class UpdateProductDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsEnum(ProductStatus)
  @IsOptional()
  status?: ProductStatus;

  @IsEnum(ProductType)
  @IsOptional()
  type?: ProductType;

  @IsInt()
  @IsOptional()
  @Min(0)
  stock?: number | null;

  @IsOptional()
  metadata?: Record<string, any>;

  @IsInt()
  @IsOptional()
  sortOrder?: number;
}
