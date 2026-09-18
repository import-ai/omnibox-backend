import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import {
  SmartFolderCondition,
  SmartFolderField,
  SmartFolderMatchMode,
  SmartFolderOperator,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
import {
  ExpressionNode,
  parseZonedDatetime,
  SmartFolderExpressionService,
} from 'omniboxd/smart-folders/smart-folder-expression.service';

export type SmartFolderSqlClause = {
  sql: string;
  params: Record<string, unknown>;
};

type PrefilterContext = {
  n: number;
  timeZone: string;
  now: Date;
  expressionService: SmartFolderExpressionService;
};

const DEFAULT_TIME_ZONE = 'UTC';

export function buildSmartFolderSqlPrefilter(
  conditions: SmartFolderCondition[],
  matchMode: SmartFolderMatchMode,
  expressionService: SmartFolderExpressionService,
  timeZone?: string,
  now = new Date(),
): { clause: SmartFolderSqlClause | null; needsContent: boolean } {
  const ctx: PrefilterContext = {
    n: 0,
    timeZone: timeZone?.trim() || DEFAULT_TIME_ZONE,
    now,
    expressionService,
  };
  const needsContent = conditions.some((condition) =>
    conditionUsesContent(condition, expressionService),
  );
  if (conditions.length <= 0) {
    return { clause: null, needsContent: false };
  }

  const clauses = conditions.map((condition) => conditionToSql(condition, ctx));
  if (matchMode === SmartFolderMatchMode.ANY) {
    if (clauses.some((clause) => clause === null)) {
      return { clause: null, needsContent };
    }
    return {
      clause: orClauses(clauses as SmartFolderSqlClause[]),
      needsContent,
    };
  }

  return {
    clause: andClauses(
      clauses.filter(
        (clause): clause is SmartFolderSqlClause => clause !== null,
      ),
    ),
    needsContent,
  };
}

function conditionUsesContent(
  condition: SmartFolderCondition,
  expressionService: SmartFolderExpressionService,
): boolean {
  if (condition.field === SmartFolderField.CONTENT) {
    return true;
  }
  if (
    condition.field === SmartFolderField.EXPRESSION &&
    typeof condition.value === 'string'
  ) {
    try {
      return expressionUsesContent(expressionService.parse(condition.value));
    } catch {
      return true;
    }
  }
  return false;
}

function expressionUsesContent(node: ExpressionNode): boolean {
  if (node.type === 'and' || node.type === 'or') {
    return (
      expressionUsesContent(node.left) || expressionUsesContent(node.right)
    );
  }
  const fieldAtom =
    node.left.type === 'field'
      ? node.left
      : node.right.type === 'field'
        ? node.right
        : null;
  return fieldAtom?.field === SmartFolderField.CONTENT;
}

function conditionToSql(
  condition: SmartFolderCondition,
  ctx: PrefilterContext,
): SmartFolderSqlClause | null {
  if (condition.field === SmartFolderField.EXPRESSION) {
    if (typeof condition.value !== 'string') {
      return null;
    }
    try {
      return nodeToSql(ctx.expressionService.parse(condition.value), ctx);
    } catch {
      return null;
    }
  }
  if (
    condition.field === SmartFolderField.CREATED_AT ||
    condition.field === SmartFolderField.UPDATED_AT
  ) {
    return structuredDateToSql(condition, ctx);
  }
  if (
    condition.field === SmartFolderField.TITLE ||
    condition.field === SmartFolderField.URL
  ) {
    return structuredTextToSql(condition, ctx);
  }
  return null;
}

function nodeToSql(
  node: ExpressionNode,
  ctx: PrefilterContext,
): SmartFolderSqlClause | null {
  if (node.type === 'and') {
    return andClauses(
      [nodeToSql(node.left, ctx), nodeToSql(node.right, ctx)].filter(
        (clause): clause is SmartFolderSqlClause => clause !== null,
      ),
    );
  }
  if (node.type === 'or') {
    const left = nodeToSql(node.left, ctx);
    const right = nodeToSql(node.right, ctx);
    if (!left || !right) {
      return null;
    }
    return orClauses([left, right]);
  }
  if (node.type !== 'compare') {
    return null;
  }
  return compareToSql(node, ctx);
}

function compareToSql(
  node: Extract<ExpressionNode, { type: 'compare' }>,
  ctx: PrefilterContext,
): SmartFolderSqlClause | null {
  const fieldAtom =
    node.left.type === 'field'
      ? node.left
      : node.right.type === 'field'
        ? node.right
        : null;
  if (!fieldAtom) {
    return null;
  }
  const valueAtom = fieldAtom === node.left ? node.right : node.left;
  const swapped = fieldAtom === node.right;
  const op = swapped ? swapOp(node.op) : node.op;
  const field = fieldAtom.field;

  if (
    field === SmartFolderField.CREATED_AT ||
    field === SmartFolderField.UPDATED_AT
  ) {
    return expressionDateToSql(field, op, valueAtom, ctx);
  }
  if (field === SmartFolderField.TITLE || field === SmartFolderField.URL) {
    return expressionTextToSql(field, op, valueAtom, ctx);
  }
  return null;
}

function expressionDateToSql(
  field: SmartFolderField,
  op: string,
  value: { type: string; value?: string; values?: string[] },
  ctx: PrefilterContext,
): SmartFolderSqlClause | null {
  const column =
    field === SmartFolderField.CREATED_AT
      ? 'resource.created_at'
      : 'resource.updated_at';
  const expr = `FLOOR(EXTRACT(EPOCH FROM ${column}))`;
  if (op === 'in' || op === 'not_in') {
    if (value.type !== 'list' || !value.values?.length) {
      return null;
    }
    const seconds = value.values
      .map((item) => parseZonedDatetime(item, ctx.timeZone))
      .map((date) => (date ? Math.floor(date.getTime() / 1000) : null));
    if (seconds.some((item) => item === null)) {
      return null;
    }
    const key = param(ctx);
    return {
      sql: `${expr} ${op === 'in' ? 'IN' : 'NOT IN'} (:...${key})`,
      params: { [key]: seconds },
    };
  }
  if (value.type !== 'string' || typeof value.value !== 'string') {
    return null;
  }
  const date = parseZonedDatetime(value.value, ctx.timeZone);
  if (!date) {
    return null;
  }
  const key = param(ctx);
  const operator =
    op === 'eq'
      ? '='
      : op === 'ne'
        ? '!='
        : op === 'gt'
          ? '>'
          : op === 'lt'
            ? '<'
            : op === 'ge'
              ? '>='
              : op === 'le'
                ? '<='
                : null;
  if (!operator) {
    return null;
  }
  return {
    sql: `${expr} ${operator} :${key}`,
    params: { [key]: Math.floor(date.getTime() / 1000) },
  };
}

function expressionTextToSql(
  field: SmartFolderField,
  op: string,
  value: { type: string; value?: string; values?: string[] },
  ctx: PrefilterContext,
): SmartFolderSqlClause | null {
  const candidate = textCandidateSql(field);
  if (!candidate) {
    return null;
  }
  if (
    op === 'in' &&
    value.type === 'string' &&
    typeof value.value === 'string'
  ) {
    return containsSql(candidate, value.value, ctx, false);
  }
  if (
    op === 'not_in' &&
    value.type === 'string' &&
    typeof value.value === 'string'
  ) {
    return containsSql(candidate, value.value, ctx, true);
  }
  if (
    (op === 'eq' || op === 'ne') &&
    value.type === 'string' &&
    typeof value.value === 'string'
  ) {
    const key = param(ctx);
    return {
      sql: `${candidate.sql} ${op === 'eq' ? '=' : '!='} :${key}`,
      params: { ...candidate.params, [key]: value.value.toLowerCase() },
    };
  }
  if (
    (op === 'in' || op === 'not_in') &&
    value.type === 'list' &&
    value.values?.length
  ) {
    const key = param(ctx);
    return {
      sql: `${candidate.sql} ${op === 'in' ? 'IN' : 'NOT IN'} (:...${key})`,
      params: {
        ...candidate.params,
        [key]: value.values.map((item) => item.toLowerCase()),
      },
    };
  }
  return null;
}

function structuredTextToSql(
  condition: SmartFolderCondition,
  ctx: PrefilterContext,
): SmartFolderSqlClause | null {
  const candidate = textCandidateSql(condition.field);
  if (!candidate) {
    return null;
  }
  const expected =
    typeof condition.value === 'string' ? condition.value.toLowerCase() : '';
  switch (condition.operator) {
    case SmartFolderOperator.CONTAINS:
      return containsSql(candidate, expected, ctx, false);
    case SmartFolderOperator.NOT_CONTAINS:
      return containsSql(candidate, expected, ctx, true);
    case SmartFolderOperator.EQUALS: {
      const key = param(ctx);
      return {
        sql: `${candidate.sql} = :${key}`,
        params: { ...candidate.params, [key]: expected },
      };
    }
    case SmartFolderOperator.NOT_EQUALS: {
      const key = param(ctx);
      return {
        sql: `${candidate.sql} != :${key}`,
        params: { ...candidate.params, [key]: expected },
      };
    }
    case SmartFolderOperator.IS_EMPTY:
      return {
        sql: `${candidate.sql} = ''`,
        params: candidate.params,
      };
    case SmartFolderOperator.IS_NOT_EMPTY:
      return {
        sql: `${candidate.sql} != ''`,
        params: candidate.params,
      };
    default:
      return null;
  }
}

function structuredDateToSql(
  condition: SmartFolderCondition,
  ctx: PrefilterContext,
): SmartFolderSqlClause | null {
  const column =
    condition.field === SmartFolderField.CREATED_AT
      ? 'resource.created_at'
      : 'resource.updated_at';
  const value =
    typeof condition.value === 'object' && condition.value !== null
      ? condition.value
      : {};
  switch (condition.operator) {
    case SmartFolderOperator.RECENT: {
      const since = getRecentSince(value.amount, value.unit, ctx.now);
      return since ? gteColumn(column, since, ctx) : null;
    }
    case SmartFolderOperator.EARLIER_THAN: {
      const since = getRecentSince(value.amount, value.unit, ctx.now);
      return since ? ltColumn(column, since, ctx) : null;
    }
    case SmartFolderOperator.BEFORE: {
      const range = getDayRange(value.date);
      return range ? ltColumn(column, range.start, ctx) : null;
    }
    case SmartFolderOperator.AFTER: {
      const range = getDayRange(value.date);
      return range ? gteColumn(column, range.end, ctx) : null;
    }
    case SmartFolderOperator.ON: {
      const range = getDayRange(value.date);
      return range
        ? andClauses([
            gteColumn(column, range.start, ctx),
            ltColumn(column, range.end, ctx),
          ])
        : null;
    }
    case SmartFolderOperator.NOT_ON: {
      const range = getDayRange(value.date);
      return range
        ? orClauses([
            ltColumn(column, range.start, ctx),
            gteColumn(column, range.end, ctx),
          ])
        : null;
    }
    case SmartFolderOperator.BETWEEN: {
      const start = getDayRange(value.start_date || value.startDate);
      const end = getDayRange(value.end_date || value.endDate);
      return start && end
        ? andClauses([
            gteColumn(column, start.start, ctx),
            ltColumn(column, end.end, ctx),
          ])
        : null;
    }
    default:
      return null;
  }
}

function textCandidateSql(
  field?: SmartFolderField,
): SmartFolderSqlClause | null {
  if (field === SmartFolderField.TITLE) {
    return { sql: 'lower(resource.name)', params: {} };
  }
  if (field === SmartFolderField.URL) {
    const linkType = ResourceType.LINK;
    const rssType = ResourceType.RSS_ITEM;
    return {
      sql: `CASE resource.resource_type WHEN '${linkType}' THEN lower(coalesce(resource.attrs->>'url', '')) WHEN '${rssType}' THEN lower(coalesce(resource.attrs->>'article_url', '')) ELSE '' END`,
      params: {},
    };
  }
  return null;
}

function containsSql(
  candidate: SmartFolderSqlClause,
  needle: string,
  ctx: PrefilterContext,
  negated: boolean,
): SmartFolderSqlClause | null {
  if (!needle) {
    return negated ? { sql: 'FALSE', params: {} } : { sql: 'TRUE', params: {} };
  }
  const key = param(ctx);
  const sql = `strpos(${candidate.sql}, :${key}) > 0`;
  return {
    sql: negated ? `NOT (${sql})` : sql,
    params: { ...candidate.params, [key]: needle.toLowerCase() },
  };
}

function gteColumn(
  column: string,
  date: Date,
  ctx: PrefilterContext,
): SmartFolderSqlClause {
  const key = param(ctx);
  return {
    sql: `${column} >= :${key}`,
    params: { [key]: date },
  };
}

function ltColumn(
  column: string,
  date: Date,
  ctx: PrefilterContext,
): SmartFolderSqlClause {
  const key = param(ctx);
  return {
    sql: `${column} < :${key}`,
    params: { [key]: date },
  };
}

function getRecentSince(
  amount?: number,
  unit?: string,
  now = new Date(),
): Date | null {
  if (!amount || amount <= 0 || !unit) {
    return null;
  }
  const since = new Date(now);
  switch (unit) {
    case 'day':
      since.setUTCDate(since.getUTCDate() - amount);
      return since;
    case 'week':
      since.setUTCDate(since.getUTCDate() - amount * 7);
      return since;
    case 'month':
      since.setUTCMonth(since.getUTCMonth() - amount);
      return since;
    case 'quarter':
      since.setUTCMonth(since.getUTCMonth() - amount * 3);
      return since;
    case 'year':
      since.setUTCFullYear(since.getUTCFullYear() - amount);
      return since;
    default:
      return null;
  }
}

function getDayRange(date?: string): { start: Date; end: Date } | null {
  if (!date) {
    return null;
  }
  const dateOnly = date.includes('T') ? date.split('T')[0] : date;
  const start = new Date(`${dateOnly}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    return null;
  }
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function andClauses(
  clauses: SmartFolderSqlClause[],
): SmartFolderSqlClause | null {
  if (clauses.length <= 0) {
    return null;
  }
  if (clauses.length === 1) {
    return clauses[0];
  }
  return {
    sql: clauses.map((clause) => `(${clause.sql})`).join(' AND '),
    params: Object.assign({}, ...clauses.map((clause) => clause.params)),
  };
}

function orClauses(
  clauses: SmartFolderSqlClause[],
): SmartFolderSqlClause | null {
  if (clauses.length <= 0) {
    return null;
  }
  if (clauses.length === 1) {
    return clauses[0];
  }
  return {
    sql: clauses.map((clause) => `(${clause.sql})`).join(' OR '),
    params: Object.assign({}, ...clauses.map((clause) => clause.params)),
  };
}

function swapOp(
  op: 'in' | 'not_in' | 'eq' | 'ne' | 'gt' | 'lt' | 'ge' | 'le',
): 'in' | 'not_in' | 'eq' | 'ne' | 'gt' | 'lt' | 'ge' | 'le' {
  if (op === 'gt') return 'lt';
  if (op === 'lt') return 'gt';
  if (op === 'ge') return 'le';
  if (op === 'le') return 'ge';
  return op;
}

function param(ctx: PrefilterContext): string {
  ctx.n += 1;
  return `sf_p${ctx.n}`;
}

export function candidateSelectColumns(includeContent: boolean): string[] {
  const columns = [
    'resource.id',
    'resource.namespaceId',
    'resource.parentId',
    'resource.name',
    'resource.resourceType',
    'resource.attrs',
    'resource.tagIds',
    'resource.createdAt',
    'resource.updatedAt',
  ];
  if (includeContent) {
    columns.push('resource.content');
  }
  return columns;
}
