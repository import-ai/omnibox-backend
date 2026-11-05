import { Expose, Type } from 'class-transformer';

import { IndexRecordDto } from './index-record.dto';

export class SearchResponseDto {
  @Expose({ name: 'records' })
  @Type(() => IndexRecordDto)
  records: IndexRecordDto[];

  @Expose({ name: 'total' })
  total?: number | null;

  @Expose({ name: 'has_more' })
  hasMore?: boolean;

  // Deprecated: only pre-filtered-pagination wizards send raw_count. Read it
  // only when has_more is absent; remove after every wizard is upgraded.
  @Expose({ name: 'raw_count' })
  rawCount?: number;
}
