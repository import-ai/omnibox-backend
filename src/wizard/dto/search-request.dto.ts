import { Expose } from 'class-transformer';
import { IndexRecordType } from './index-record.dto';

export class SearchRequestDto {
  @Expose({ name: 'query' })
  query: string;

  @Expose({ name: 'namespace_id' })
  namespaceId: string;

  @Expose({ name: 'user_id' })
  userId?: string;

  @Expose({ name: 'type' })
  type?: IndexRecordType;

  @Expose({ name: 'offset' })
  offset?: number;

  @Expose({ name: 'limit' })
  limit?: number;
}
