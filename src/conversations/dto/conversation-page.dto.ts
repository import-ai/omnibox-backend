import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class ConversationPageQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 10;

  @IsOptional()
  @IsUUID()
  branch_leaf_id?: string;

  @IsOptional()
  @IsUUID()
  branch_node_id?: string;
}

export class MessageDetailsQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',') : value,
  )
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  ids: string[];
}
