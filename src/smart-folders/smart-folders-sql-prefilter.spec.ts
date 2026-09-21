import {
  SmartFolderField,
  SmartFolderMatchMode,
  SmartFolderOperator,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
import { SmartFolderExpressionService } from 'omniboxd/smart-folders/smart-folder-expression.service';
import { testI18n } from 'omniboxd/smart-folders/smart-folder-i18n.test-util';
import { buildSmartFolderSqlPrefilter } from 'omniboxd/smart-folders/smart-folders-sql-prefilter';

describe('buildSmartFolderSqlPrefilter', () => {
  const expressionService = new SmartFolderExpressionService(
    testI18n('en') as any,
  );

  it('pushes url contains and created_at from an expression', () => {
    const { clause, needsContent } = buildSmartFolderSqlPrefilter(
      [
        {
          field: SmartFolderField.EXPRESSION,
          value:
            "('zhihu' in url or 'xiaohongshu' in url) and created_at >= '2026-03-07 00:00:00'",
        },
      ],
      SmartFolderMatchMode.ALL,
      expressionService,
      'UTC',
    );

    expect(needsContent).toBe(false);
    expect(clause).not.toBeNull();
    expect(clause?.sql).toContain('strpos(');
    expect(clause?.sql).toContain("attrs->>'url'");
    expect(clause?.sql).toContain("attrs->>'article_url'");
    expect(clause?.sql).toContain(
      'FLOOR(EXTRACT(EPOCH FROM resource.created_at))',
    );
    expect(Object.values(clause?.params || {})).toEqual(
      expect.arrayContaining([
        'zhihu',
        'xiaohongshu',
        Math.floor(Date.parse('2026-03-07T00:00:00.000Z') / 1000),
      ]),
    );
  });

  it('does not select content unless a content rule is present', () => {
    const { needsContent } = buildSmartFolderSqlPrefilter(
      [
        {
          field: SmartFolderField.TITLE,
          operator: SmartFolderOperator.CONTAINS,
          value: 'matched',
        },
      ],
      SmartFolderMatchMode.ALL,
      expressionService,
    );
    expect(needsContent).toBe(false);
  });

  it('marks content expressions as needing content and skips unpushable or-branches', () => {
    const { clause, needsContent } = buildSmartFolderSqlPrefilter(
      [
        {
          field: SmartFolderField.EXPRESSION,
          value: "'foo' in content or created_at >= '2026-03-07 00:00:00'",
        },
      ],
      SmartFolderMatchMode.ALL,
      expressionService,
    );
    expect(needsContent).toBe(true);
    expect(clause).toBeNull();
  });
});
