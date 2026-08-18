import { Injectable } from '@nestjs/common';
import { APIKey } from 'omniboxd/api-key/api-key.entity';
import { OpenResourcesService } from 'omniboxd/namespace-resources/open-resources.service';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { DocType } from 'omniboxd/search/doc-type.enum';
import { IndexedResourceDto } from 'omniboxd/search/dto/indexed-doc.dto';
import { IndexRecordType } from 'omniboxd/wizard/dto/index-record.dto';
import { SearchRequestDto } from 'omniboxd/wizard/dto/search-request.dto';
import { WizardAPIService } from 'omniboxd/wizard-api/wizard-api.service';

@Injectable()
export class OpenSearchService {
  constructor(
    private readonly wizardApiService: WizardAPIService,
    private readonly openResourcesService: OpenResourcesService,
    private readonly resourcesService: ResourcesService,
  ) {}

  async search(
    apiKey: APIKey,
    query: string,
    options?: { offset?: number; limit?: number },
  ): Promise<IndexedResourceDto[]> {
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 100);
    const offset = Math.max(options?.offset ?? 0, 0);

    const searchRequest = new SearchRequestDto();
    searchRequest.query = query;
    searchRequest.namespaceId = apiKey.namespaceId;
    searchRequest.userId = apiKey.userId;
    searchRequest.type = IndexRecordType.CHUNK;
    searchRequest.offset = offset;
    searchRequest.limit = limit;
    const result = await this.wizardApiService.search(searchRequest);
    const resourceIds: string[] = [];
    const seenResourceIds = new Set<string>();

    for (const record of result?.records || []) {
      if (record.type !== IndexRecordType.CHUNK || !record.chunk) {
        continue;
      }
      if (seenResourceIds.has(record.chunk.resourceId)) {
        continue;
      }
      seenResourceIds.add(record.chunk.resourceId);
      resourceIds.push(record.chunk.resourceId);
    }

    const scopedResourceIds =
      await this.openResourcesService.filterResourceScope(
        apiKey.namespaceId,
        apiKey.attrs.root_resource_id,
        apiKey.userId,
        resourceIds,
      );
    const scopedResourceIdSet = new Set(scopedResourceIds);
    const resourceMetaMap = await this.resourcesService.batchGetResourceMeta(
      apiKey.namespaceId,
      scopedResourceIds,
    );

    const items: IndexedResourceDto[] = [];
    seenResourceIds.clear();
    for (const record of result?.records || []) {
      if (record.type !== IndexRecordType.CHUNK || !record.chunk) {
        continue;
      }

      const chunk = record.chunk;
      if (
        seenResourceIds.has(chunk.resourceId) ||
        !scopedResourceIdSet.has(chunk.resourceId)
      ) {
        continue;
      }

      seenResourceIds.add(chunk.resourceId);
      const resourceMeta = resourceMetaMap.get(chunk.resourceId);
      items.push({
        type: DocType.RESOURCE,
        id: record.id,
        resourceId: chunk.resourceId,
        title: chunk.title || 'Untitled',
        content: chunk.text || '',
        attrs: resourceMeta?.attrs || {},
        resourceType: resourceMeta?.resourceType || ResourceType.DOC,
      });
    }

    return items;
  }
}
