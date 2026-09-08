import { HttpStatus } from '@nestjs/common';
import { readFileSync } from 'fs';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { join } from 'path';

import { SmartFolderExpressionService } from './smart-folder-expression.service';

const locales = {
  en: JSON.parse(
    readFileSync(join(__dirname, '../i18n/en/resource.json'), 'utf8'),
  ),
  zh: JSON.parse(
    readFileSync(join(__dirname, '../i18n/zh/resource.json'), 'utf8'),
  ),
} as const;

function lookup(lang: 'en' | 'zh', key: string): string | undefined {
  const path = key.replace(/^resource\./, '').split('.');
  let value: unknown = locales[lang];
  for (const part of path) {
    if (!value || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return typeof value === 'string' ? value : undefined;
}

function interpolate(
  template: string,
  args: Record<string, unknown> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    const value = args[name];
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }
    return `{${name}}`;
  });
}

function i18n(defaultLang: 'en' | 'zh' = 'en') {
  return {
    t: (
      key: string,
      opts?: { args?: Record<string, unknown>; lang?: string },
    ) => {
      const lang =
        opts?.lang === 'zh' || opts?.lang === 'en' ? opts.lang : defaultLang;
      const template = lookup(lang, key) ?? lookup('en', key) ?? key;
      return interpolate(template, opts?.args);
    },
  };
}

describe('SmartFolderExpressionService', () => {
  const service = new SmartFolderExpressionService(i18n('en') as any);

  function resource(values: Partial<Resource> = {}): Resource {
    return {
      id: 'resource-id',
      name: 'Quarterly Planning',
      resourceType: ResourceType.DOC,
      attrs: {},
      content: 'hello baz',
      tagIds: ['finance'],
      createdAt: new Date('2026-09-08T00:00:00.000Z'),
      updatedAt: new Date('2026-09-09T12:30:00.000Z'),
      ...values,
    } as Resource;
  }

  function parseError(expression: string): AppException {
    try {
      service.parse(expression);
      throw new Error(`expected ${expression} to fail`);
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      return error as AppException;
    }
  }

  it('matches python-style text membership and equality', () => {
    const item = resource();
    expect(service.matches(item, "'plan' in title")).toBe(true);
    expect(
      service.matches(item, "title in ['quarterly planning', 'other']"),
    ).toBe(true);
    expect(service.matches(item, "title == 'quarterly planning'")).toBe(true);
    expect(service.matches(item, "title != 'foo'")).toBe(true);
    expect(service.matches(item, "'hello' in content")).toBe(true);
  });

  it('matches tag as membership and accepts the tags alias', () => {
    const item = resource({
      attrs: { tag_names: ['Roadmap'] },
    });
    expect(service.matches(item, "'roadmap' in tag")).toBe(true);
    expect(service.matches(item, "'finance' in tags")).toBe(true);
    expect(service.matches(item, "tag in ['finance', 'other']")).toBe(true);
    expect(service.matches(item, "'missing' not in tag")).toBe(true);
  });

  it('matches datetime fields as requester-timezone YYYY-MM-DD HH:MM:SS literals', () => {
    const item = resource();
    expect(service.matches(item, "created_at >= '2026-09-08 00:00:00'")).toBe(
      true,
    );
    expect(service.matches(item, "created_at > '2026-09-08 00:00:00'")).toBe(
      false,
    );
    expect(service.matches(item, "created_at == '2026-09-08 00:00:00'")).toBe(
      true,
    );
    expect(service.matches(item, "'2026-09-09 12:30:00' <= updated_at")).toBe(
      true,
    );
    expect(
      service.matches(
        item,
        "created_at in ['2026-09-07 00:00:00', '2026-09-08 00:00:00']",
      ),
    ).toBe(true);
    expect(
      service.matches(
        item,
        "created_at >= '2026-09-08 08:00:00'",
        'Asia/Shanghai',
      ),
    ).toBe(true);
    expect(
      service.matches(
        item,
        "created_at > '2026-09-08 08:00:00'",
        'Asia/Shanghai',
      ),
    ).toBe(false);
    expect(
      service.matches(
        item,
        "created_at == '2026-09-08 00:00:00'",
        'Asia/Shanghai',
      ),
    ).toBe(false);
  });

  it('matches file_name_ext as the suffix after the last dot', () => {
    const item = resource({
      resourceType: ResourceType.FILE,
      attrs: { original_name: 'Quarterly Planning.docx' },
    });
    expect(service.matches(item, "file_name_ext in ['jpg', 'docx']")).toBe(
      true,
    );
    expect(service.matches(item, "file_name_ext in ['.jpg', '.docx']")).toBe(
      true,
    );
    expect(service.matches(item, "'.docx' in file_name_ext")).toBe(true);
    expect(service.matches(item, "file_name_ext == 'docx'")).toBe(true);
    expect(service.matches(item, "file_name_ext in ['doc']")).toBe(false);
    expect(service.matches(item, "file_name in ['.docx']")).toBe(false);
    expect(
      service.matches(
        resource({ attrs: { original_name: 'notes' } }),
        "file_name_ext == ''",
      ),
    ).toBe(true);
    expect(
      service.matches(
        resource({ attrs: { original_name: '.gitignore' } }),
        "file_name_ext == 'gitignore'",
      ),
    ).toBe(false);
    expect(
      service.matches(
        resource({ attrs: { filename: 'archive.tar.gz' } }),
        "file_name_ext == 'gz'",
      ),
    ).toBe(true);
  });

  it('evaluates nested and / or groups', () => {
    expect(
      service.matches(
        resource(),
        "title == 'foo' or (title == 'quarterly planning' and 'baz' in content)",
      ),
    ).toBe(true);
  });

  it('rejects unknown operators without old-syntax aliases', () => {
    expect(parseError("title = 'foo'").message).toContain(
      "Unknown operator '='",
    );
    expect(parseError("title includes 'foo'").message).toContain(
      "Unknown operator 'includes'",
    );
  });

  it('rejects unknown fields, bad datetime format, and comparisons on text', () => {
    const unknown = parseError("'foo' in name");
    expect(unknown.message).toContain("Unknown field 'name'");
    expect(unknown.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect((unknown.getResponse() as { hint?: string }).hint).toContain(
      'created_at',
    );
    expect((unknown.getResponse() as { hint?: string }).hint).toContain(
      'tags is an alias of tag',
    );

    expect(parseError("created_at >= '2026-09-08'").message).toContain(
      'YYYY-MM-DD HH:MM:SS',
    );
    expect(parseError("title >= 'foo'").message).toContain(
      'only applies to created_at and updated_at',
    );
    expect(parseError("title in 'foo'").message).toContain(
      'When the field is on the left, use a list',
    );
    expect((unknown.getResponse() as { error?: string }).error).toBe(
      'unknown_field',
    );
  });

  it('translates message and hint while keeping an English reason', () => {
    const zhService = new SmartFolderExpressionService(i18n('zh') as any);
    try {
      zhService.parse("'foo' in file_nasme_ext");
      throw new Error('expected parse to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      const exception = error as AppException;
      const body = exception.getResponse() as {
        reason?: string;
        hint?: string;
        error?: string;
      };
      expect(exception.message).toContain("未知字段 'file_nasme_ext'");
      expect(body.reason).toContain("Unknown field 'file_nasme_ext'");
      expect(body.hint).toContain('可用字段');
      expect(body.error).toBe('unknown_field');
    }
  });
});
