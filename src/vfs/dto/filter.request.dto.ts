import { HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { Expose, plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class VFSResourceFilterOptionsDto {
  @Expose({ name: 'created_at_before' })
  @IsOptional()
  createdAtBefore?: Date;

  @Expose({ name: 'created_at_after' })
  @IsOptional()
  createdAtAfter?: Date;

  @Expose({ name: 'updated_at_before' })
  @IsOptional()
  updatedAtBefore?: Date;

  @Expose({ name: 'updated_at_after' })
  @IsOptional()
  updatedAtAfter?: Date;

  @Expose({ name: 'tag_pattern' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  tagPattern?: string;

  @Expose({ name: 'name_pattern' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  namePattern?: string;

  @Expose({ name: 'content_pattern' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  contentPattern?: string;

  @Expose({ name: 'url_pattern' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  urlPattern?: string;

  @Expose({ name: 'user_id' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  userId?: string;

  @Expose({ name: 'parent_id' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  parentId?: string;

  @Expose({ name: 'resource_types' })
  @IsOptional()
  resourceTypes?: ResourceType[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class VFSFilterResourcesRequestDto {
  @IsOptional()
  path?: string;

  @Transform(({ value }) => {
    // If already an object, return as-is
    if (typeof value === 'object' && value !== null) {
      return plainToInstance(VFSResourceFilterOptionsDto, value);
    }
    // If string, try to parse as JSON
    if (typeof value === 'string') {
      try {
        return plainToInstance(VFSResourceFilterOptionsDto, JSON.parse(value));
      } catch {
        throw new AppException(
          'Invalid JSON in options',
          'INVALID_JSON',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    return value;
  })
  @ValidateNested()
  @Type(() => VFSResourceFilterOptionsDto)
  options?: VFSResourceFilterOptionsDto;
}
