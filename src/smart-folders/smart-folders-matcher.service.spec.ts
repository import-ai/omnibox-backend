import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import {
  SmartFolderField,
  SmartFolderMatchMode,
  SmartFolderOperator,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
import { SmartFoldersMatcherService } from 'omniboxd/smart-folders/smart-folders-matcher.service';

describe('SmartFoldersMatcherService', () => {
  const service = new SmartFoldersMatcherService();

  function resource(values: Partial<Resource>): Resource {
    return {
      id: 'resource-id',
      name: 'Quarterly Planning',
      resourceType: ResourceType.DOC,
      attrs: {},
      content: '',
      tagIds: [],
      createdAt: new Date('2026-05-18T12:00:00.000Z'),
      updatedAt: new Date('2026-05-19T12:00:00.000Z'),
      ...values,
    } as Resource;
  }

  it('matches text and tag conditions case-insensitively', () => {
    const matched = service.matches(
      resource({
        name: 'Quarterly Planning',
        tagIds: ['finance'],
        attrs: { tag_names: ['Roadmap'] },
      }),
      [
        {
          field: SmartFolderField.TITLE,
          operator: SmartFolderOperator.CONTAINS,
          value: 'planning',
        },
        {
          field: SmartFolderField.TAGS,
          operator: SmartFolderOperator.CONTAINS,
          value: 'roadmap',
        },
      ],
      SmartFolderMatchMode.ALL,
    );

    expect(matched).toBe(true);
  });

  it('matches BETWEEN date ranges inclusively through the end day', () => {
    const matched = service.matches(
      resource({ createdAt: new Date('2026-05-18T23:59:59.000Z') }),
      [
        {
          field: SmartFolderField.CREATED_AT,
          operator: SmartFolderOperator.BETWEEN,
          value: {
            start_date: '2026-05-01',
            end_date: '2026-05-18',
          },
        },
      ],
      SmartFolderMatchMode.ALL,
    );

    expect(matched).toBe(true);
  });

  it('matches UPDATED_AT date conditions against resource updatedAt', () => {
    const matched = service.matches(
      resource({
        createdAt: new Date('2026-05-10T12:00:00.000Z'),
        updatedAt: new Date('2026-05-18T12:00:00.000Z'),
      }),
      [
        {
          field: SmartFolderField.UPDATED_AT,
          operator: SmartFolderOperator.ON,
          value: {
            date: '2026-05-18',
          },
        },
      ],
      SmartFolderMatchMode.ALL,
    );

    expect(matched).toBe(true);
  });

  it('handles empty value operators without requiring condition values', () => {
    const matched = service.matches(
      resource({ name: '' }),
      [
        {
          field: SmartFolderField.TITLE,
          operator: SmartFolderOperator.IS_EMPTY,
        },
      ],
      SmartFolderMatchMode.ALL,
    );

    expect(matched).toBe(true);
  });
});
