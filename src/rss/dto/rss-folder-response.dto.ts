import { Expose } from 'class-transformer';
import { ResourceDto } from 'omniboxd/namespace-resources/dto/resource.dto';
import { RssLink } from 'omniboxd/rss/entities/rss-link.entity';

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

  static fromData(params: {
    resource: ResourceDto;
    links: RssLink[];
  }): RssFolderResponseDto {
    const dto = new RssFolderResponseDto();
    dto.resource = params.resource;
    dto.links = params.links.map((link) => RssLinkResponseDto.fromEntity(link));
    const createdAt = params.links[0]?.createdAt;
    const updatedAt = params.links[0]?.updatedAt;
    dto.createdAt = (createdAt ?? new Date()).toISOString();
    dto.updatedAt = (updatedAt ?? new Date()).toISOString();
    return dto;
  }
}
