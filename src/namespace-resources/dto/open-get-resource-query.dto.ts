import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const DEFAULT_OPEN_RESOURCE_CONTENT_LIMIT = 100;
export const MAX_OPEN_RESOURCE_CONTENT_LIMIT = 1000;

export class OpenGetResourceQueryDto {
  @ApiPropertyOptional({
    description: '0-based line offset for paginating resource content.',
    default: 0,
    minimum: 0,
  })
  @Transform(({ value }) => (value === undefined ? 0 : Number(value)))
  @IsInt()
  @Min(0)
  content_offset = 0;

  @ApiPropertyOptional({
    description: 'Maximum number of content lines to return.',
    default: DEFAULT_OPEN_RESOURCE_CONTENT_LIMIT,
    minimum: 1,
    maximum: MAX_OPEN_RESOURCE_CONTENT_LIMIT,
  })
  @Transform(({ value }) =>
    value === undefined ? DEFAULT_OPEN_RESOURCE_CONTENT_LIMIT : Number(value),
  )
  @IsInt()
  @Min(1)
  @Max(MAX_OPEN_RESOURCE_CONTENT_LIMIT)
  content_limit = DEFAULT_OPEN_RESOURCE_CONTENT_LIMIT;
}
