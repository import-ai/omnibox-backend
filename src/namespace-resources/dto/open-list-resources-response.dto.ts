import { ApiProperty } from '@nestjs/swagger';
import { ResourceSummaryDto } from './resource-summary.dto';

export class OpenListResourcesResponseDto {
  @ApiProperty({
    description: 'Resources in the current page.',
    type: [ResourceSummaryDto],
  })
  resources: ResourceSummaryDto[];

  @ApiProperty({
    description:
      'Total number of visible resources matching the same parent scope before applying limit and offset.',
    example: 42,
  })
  total: number;
}
