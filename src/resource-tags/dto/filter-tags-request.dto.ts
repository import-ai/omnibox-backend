import { IsOptional, IsString, IsInt, Min } from 'class-validator';
import { Expose, Type } from 'class-transformer';
import { ListTagsRequestDto } from 'omniboxd/resource-tags/dto/list-tags-request.dto';

export class FilterTagsRequestDto extends ListTagsRequestDto {
  @IsOptional()
  @IsString()
  @Expose({ name: 'tag_pattern' })
  tagPattern?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Expose({ name: 'resource_cnt_less_or_equal_than' })
  resourceCntLessOrEqualThan?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Expose({ name: 'resource_cnt_greater_or_equal_than' })
  resourceCntGreaterOrEqualThan?: number;
}
