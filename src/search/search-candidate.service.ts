import { Injectable } from '@nestjs/common';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import {
  SearchFilterOptions,
  SearchResourceFilterService,
} from './search-resource-filter.service';

@Injectable()
export class SearchCandidateService {
  constructor(
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly searchResourceFilterService: SearchResourceFilterService,
  ) {}

  async getFilterCandidateResourceIds(
    userId: string,
    namespaceId: string,
    options?: SearchFilterOptions,
  ): Promise<string[] | null> {
    const conditions = options?.conditions || [];
    if (conditions.length <= 0) {
      return null;
    }

    const visibleResources =
      await this.namespaceResourcesService.getAllResourcesByUser(
        userId,
        namespaceId,
      );
    const visibleResourceIds = visibleResources.map((resource) => resource.id);
    const matchedResourceIds =
      await this.searchResourceFilterService.getMatchedResourceIds(
        namespaceId,
        visibleResourceIds,
        options,
      );
    if (!matchedResourceIds) {
      return null;
    }

    return visibleResourceIds.filter((id) => matchedResourceIds.has(id));
  }
}
