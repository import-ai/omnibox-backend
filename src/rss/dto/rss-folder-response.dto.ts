import { Expose } from 'class-transformer';
import { ResourceDto } from 'omniboxd/namespace-resources/dto/resource.dto';
import { RssLink } from 'omniboxd/rss/entities/rss-link.entity';

export enum RssFolderInitialSyncStatus {
  PENDING = 'pending',
  POLLING = 'polling',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
}

export class RssLinkResponseDto {
  @Expose()
  id: string;
  @Expose()
  index: number;
  @Expose()
  url: string;
  @Expose()
  name: string;

  static fromEntity(entity: RssLink): RssLinkResponseDto {
    const dto = new RssLinkResponseDto();
    dto.id = entity.id;
    dto.index = entity.index;
    dto.url = entity.url;
    dto.name = entity.name;
    return dto;
  }
}

export class RssFolderResponseDto {
  @Expose()
  resource: ResourceDto;
  @Expose()
  links: RssLinkResponseDto[];
  @Expose({ name: 'created_at' })
  createdAt: string;
  @Expose({ name: 'updated_at' })
  updatedAt: string;
  @Expose({ name: 'initial_sync_status' })
  initialSyncStatus: RssFolderInitialSyncStatus;

  static fromData(params: {
    resource: ResourceDto;
    links: RssLink[];
    initialSyncStatus: RssFolderInitialSyncStatus;
  }): RssFolderResponseDto {
    const dto = new RssFolderResponseDto();
    dto.resource = params.resource;
    dto.links = params.links.map((link) => RssLinkResponseDto.fromEntity(link));
    // The folder's own timestamps. Reading them off links[0] made a folder
    // report "now" as its creation time whenever its links were rewritten, and
    // made reordering links change them.
    dto.createdAt = params.resource.created_at;
    dto.updatedAt = params.resource.updated_at;
    dto.initialSyncStatus = params.initialSyncStatus;
    return dto;
  }
}
