import { Injectable } from '@nestjs/common';
import { DocType } from './doc-type.enum';
import { IndexedDocDto, IndexedResourceDto } from './dto/indexed-doc.dto';
import { PermissionsService } from 'src/permissions/permissions.service';
import { PermissionLevel } from 'src/permissions/permission-level.enum';

const indexUid = 'omniboxIdx';

@Injectable()
export class SearchService {
  constructor(private readonly permissionsService: PermissionsService) {}

  async search(
    namespaceId: string,
    query: string,
    type?: DocType,
    userId?: string,
  ) {
    const filter = [`namespaceId = "${namespaceId}"`];
    if (userId) {
      filter.push(`userId NOT EXISTS OR userId = "${userId}"`);
    }
    if (type) {
      filter.push(`type = "${type}"`);
    }
    const searchParams: SearchParams = {
      filter,
      showRankingScore: true,
    };
    if (query) {
      searchParams.vector = await this.getEmbedding(query);
      searchParams.hybrid = {
        embedder: 'omniboxEmbed',
      };
    }
    const index = await this.meili.getIndex(indexUid);
    const result = await index.search(query, searchParams);
    const items: IndexedDocDto[] = [];
    if (userId) {
      for (const hit of result.hits) {
        hit.id = hit.id.replace(/^(message_|resource_)/, '');
        if (hit.type === DocType.RESOURCE) {
          const resource = hit as IndexedResourceDto;
          const hasPermission = await this.permissionsService.userHasPermission(
            namespaceId,
            resource.id,
            userId,
            PermissionLevel.CAN_VIEW,
          );
          if (!hasPermission) {
            continue;
          }
        }
        items.push(hit as IndexedDocDto);
      }
    }
    return items;
  }

  async wizardSearch() {}
}
