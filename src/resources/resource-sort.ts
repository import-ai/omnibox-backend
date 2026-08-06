import type { Resource } from './entities/resource.entity';

export enum ResourceSortBy {
  UPDATED_AT = 'updated_at',
  CREATED_AT = 'created_at',
  TITLE = 'title',
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

const titleCollator = new Intl.Collator('zh-CN-u-co-pinyin', {
  numeric: true,
  sensitivity: 'base',
});
const chinesePattern = /\p{Script=Han}/u;

function compareTitle(left: Resource, right: Resource): number {
  const languageComparison =
    Number(!chinesePattern.test(left.name)) -
    Number(!chinesePattern.test(right.name));
  return languageComparison || titleCollator.compare(left.name, right.name);
}

function compareManual(left: Resource, right: Resource): number {
  if (left.manualSortIndex == null && right.manualSortIndex == null) {
    return (
      (left.manualSortUnspecifiedAt?.getTime() ?? left.updatedAt.getTime()) -
        (right.manualSortUnspecifiedAt?.getTime() ??
          right.updatedAt.getTime()) || left.id.localeCompare(right.id)
    );
  }
  if (left.manualSortIndex == null) {
    return 1;
  }
  if (right.manualSortIndex == null) {
    return -1;
  }
  const comparison =
    BigInt(left.manualSortIndex) - BigInt(right.manualSortIndex);
  return comparison === 0n
    ? left.id.localeCompare(right.id)
    : comparison < 0n
      ? -1
      : 1;
}

export function getDefaultSortOrder(sortBy: ResourceSortBy): ResourceSortOrder {
  return sortBy === ResourceSortBy.TITLE
    ? ResourceSortOrder.ASC
    : ResourceSortOrder.DESC;
}

export function sortResources<T extends Resource>(
  resources: T[],
  options: ResourceSortOptions = {},
): T[] {
  const sortBy = options.sortBy ?? ResourceSortBy.UPDATED_AT;
  const sortOrder = options.sortOrder ?? getDefaultSortOrder(sortBy);

  return resources.toSorted((left, right) => {
    if (sortBy === ResourceSortBy.MANUAL) {
      return compareManual(left, right);
    }

    let comparison: number;
    switch (sortBy) {
      case ResourceSortBy.CREATED_AT:
        comparison = left.createdAt.getTime() - right.createdAt.getTime();
        break;
      case ResourceSortBy.TITLE:
        comparison = compareTitle(left, right);
        break;
      default:
        comparison = left.updatedAt.getTime() - right.updatedAt.getTime();
    }

    if (comparison === 0) {
      comparison = left.id.localeCompare(right.id);
    }
    return sortOrder === ResourceSortOrder.DESC ? -comparison : comparison;
  });
}

export function applyPartialManualOrder<T extends Resource>(
  resources: T[],
  orderedIds: string[],
): T[] {
  const resourcesById = new Map(
    resources.map((resource) => [resource.id, resource]),
  );
  const requestedResources = orderedIds.map((id) => resourcesById.get(id)!);
  const requestedIds = new Set(orderedIds);
  let requestedIndex = 0;
  const merged = sortResources(resources, {
    sortBy: ResourceSortBy.MANUAL,
  }).map((resource) =>
    requestedIds.has(resource.id)
      ? requestedResources[requestedIndex++]
      : resource,
  );
  merged.forEach((resource, index) => {
    resource.manualSortIndex = String(index + 1);
  });
  return merged;
}
