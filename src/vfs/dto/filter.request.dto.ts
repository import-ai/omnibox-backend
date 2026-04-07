import { FilterResourcesRequestDto } from 'omniboxd/namespace-resources/dto/filter-resources-request.dto';

export class VFSFilterResourcesRequestDto extends FilterResourcesRequestDto {
  path?: string;

  offset?: number;

  limit?: number;
}
