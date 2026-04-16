import { Expose, Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class TagRenameResponseDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Expose({ name: 'affected_resource_cnt' })
  affectedResourceCnt: number;

  static fromNumber(affectedResourceCnt: number) {
    const dto = new TagRenameResponseDto();
    dto.affectedResourceCnt = affectedResourceCnt;
    return dto;
  }
}
