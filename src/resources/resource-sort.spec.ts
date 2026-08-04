import { Resource } from './entities/resource.entity';
import {
  ResourceSortBy,
  ResourceSortOrder,
  sortResources,
} from './resource-sort';

function resource(
  id: string,
  name: string,
  options: Partial<Resource> = {},
): Resource {
  return {
    id,
    name,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    manualSortIndex: null,
    ...options,
  } as Resource;
}

describe('sortResources', () => {
  it('sorts timestamps in both directions', () => {
    const oldResource = resource('old', 'Old', {
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const newResource = resource('new', 'New', {
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    expect(
      sortResources([oldResource, newResource], {
        sortBy: ResourceSortBy.UPDATED_AT,
        sortOrder: ResourceSortOrder.DESC,
      }).map(({ id }) => id),
    ).toEqual(['new', 'old']);
    expect(
      sortResources([oldResource, newResource], {
        sortBy: ResourceSortBy.UPDATED_AT,
        sortOrder: ResourceSortOrder.ASC,
      }).map(({ id }) => id),
    ).toEqual(['old', 'new']);
  });

  it('sorts Chinese titles by pinyin before non-Chinese titles', () => {
    const resources = [
      resource('english', 'Apple'),
      resource('bo', '波浪'),
      resource('an', '安全'),
    ];

    expect(
      sortResources(resources, {
        sortBy: ResourceSortBy.TITLE,
        sortOrder: ResourceSortOrder.ASC,
      }).map(({ id }) => id),
    ).toEqual(['an', 'bo', 'english']);
    expect(
      sortResources(resources, {
        sortBy: ResourceSortBy.TITLE,
        sortOrder: ResourceSortOrder.DESC,
      }).map(({ id }) => id),
    ).toEqual(['english', 'bo', 'an']);
  });

  it('defaults title sorting to A-Z', () => {
    const resources = [resource('b', 'Beta'), resource('a', 'Alpha')];

    expect(
      sortResources(resources, { sortBy: ResourceSortBy.TITLE }).map(
        ({ name }) => name,
      ),
    ).toEqual(['Alpha', 'Beta']);
  });

  it('puts resources without a manual position last', () => {
    const resources = [
      resource('unspecified', 'Unspecified'),
      resource('second', 'Second', { manualSortIndex: '2' }),
      resource('first', 'First', { manualSortIndex: '1' }),
    ];

    expect(
      sortResources(resources, { sortBy: ResourceSortBy.MANUAL }).map(
        ({ id }) => id,
      ),
    ).toEqual(['first', 'second', 'unspecified']);
  });
});
