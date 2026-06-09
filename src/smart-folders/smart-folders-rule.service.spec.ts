import {
  SmartFolderField,
  SmartFolderOperator,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
import { SmartFoldersRuleService } from 'omniboxd/smart-folders/smart-folders-rule.service';

describe('SmartFoldersRuleService', () => {
  const i18n = {
    t: jest.fn((key: string) => key),
  };
  const service = new SmartFoldersRuleService(i18n as any);

  it('normalizes BETWEEN date ranges to ascending snake_case values', () => {
    const result = service.normalize([
      {
        field: SmartFolderField.CREATED_AT,
        operator: SmartFolderOperator.BETWEEN,
        value: {
          startDate: '2026-05-18',
          endDate: '2026-05-01',
        },
      },
    ]);

    expect(result).toEqual([
      {
        field: SmartFolderField.CREATED_AT,
        operator: SmartFolderOperator.BETWEEN,
        value: {
          start_date: '2026-05-01',
          end_date: '2026-05-18',
        },
      },
    ]);
  });

  it('normalizes UPDATED_AT between date ranges as date conditions', () => {
    const result = service.normalize([
      {
        field: SmartFolderField.UPDATED_AT,
        operator: SmartFolderOperator.BETWEEN,
        value: {
          startDate: '2026-05-18',
          endDate: '2026-05-01',
        },
      },
    ]);

    expect(result).toEqual([
      {
        field: SmartFolderField.UPDATED_AT,
        operator: SmartFolderOperator.BETWEEN,
        value: {
          start_date: '2026-05-01',
          end_date: '2026-05-18',
        },
      },
    ]);
  });

  it('drops values for empty text operators', () => {
    const result = service.normalize([
      {
        field: SmartFolderField.TITLE,
        operator: SmartFolderOperator.IS_EMPTY,
        value: 'ignored',
      },
    ]);

    expect(result).toEqual([
      {
        field: SmartFolderField.TITLE,
        operator: SmartFolderOperator.IS_EMPTY,
      },
    ]);
  });

  it('rejects operators that do not apply to the field type', () => {
    expect(() =>
      service.normalize([
        {
          field: SmartFolderField.TITLE,
          operator: SmartFolderOperator.BETWEEN,
          value: {
            start_date: '2026-05-01',
            end_date: '2026-05-18',
          },
        },
      ]),
    ).toThrow('resource.errors.smartFolderConditionOperatorInvalid');
  });
});
