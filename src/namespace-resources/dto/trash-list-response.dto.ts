import { Expose } from 'class-transformer';
import { TrashItemDto } from './trash-item.dto';

export class TrashListResponseDto {
  @Expose()
  items: TrashItemDto[];

  @Expose()
  total: number;

  @Expose()
  limit: number;

  @Expose()
  offset: number;

  static create(
    items: TrashItemDto[],
    total: number,
    limit: number,
    offset: number,
  ): TrashListResponseDto {
    const dto = new TrashListResponseDto();
    dto.items = items;
    dto.total = total;
    dto.limit = limit;
    dto.offset = offset;
    return dto;
  }
}
