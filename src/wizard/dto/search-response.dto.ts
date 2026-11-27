import { Expose, Type } from 'class-transformer';

import { IndexRecordDto } from './index-record.dto';

export class SearchResponseDto {
  @Expose({ name: 'records' })
  @Type(() => IndexRecordDto)
  records: IndexRecordDto[];

  @Expose({ name: 'has_more' })
  hasMore?: boolean;

  @Expose({ name: 'partial' })
  partial?: boolean;
}
