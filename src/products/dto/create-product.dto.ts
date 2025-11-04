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

export class CreateProductDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsNumber()
  @Min(0)
  price: number;

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
