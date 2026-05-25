export enum ResourceSortBy {
  UPDATED_AT = 'updated_at',
  CREATED_AT = 'created_at',
  NAME = 'name',
  MANUAL = 'manual',
}

export enum ResourceSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export interface ResourceSortOptions {
  sortBy?: ResourceSortBy;
  sortOrder?: ResourceSortOrder;
}

export const DEFAULT_RESOURCE_SORT_BY = ResourceSortBy.UPDATED_AT;
export const DEFAULT_RESOURCE_SORT_ORDER = ResourceSortOrder.DESC;

export function getDefaultResourceSortOrder(
  sortBy: ResourceSortBy,
): ResourceSortOrder {
  if (sortBy === ResourceSortBy.NAME || sortBy === ResourceSortBy.MANUAL) {
    return ResourceSortOrder.ASC;
  }
  return DEFAULT_RESOURCE_SORT_ORDER;
}
