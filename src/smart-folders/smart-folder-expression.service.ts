import { HttpStatus, Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';

import { SmartFolderField } from './entities/smart-folder-config.entity';

type FieldName =
  | SmartFolderField.TITLE
  | SmartFolderField.TAGS
  | SmartFolderField.URL
  | SmartFolderField.FILE_NAME
  | SmartFolderField.FILE_NAME_EXT
  | SmartFolderField.CONTENT
  | SmartFolderField.CREATED_AT
  | SmartFolderField.UPDATED_AT;

type CompareOp = 'in' | 'not_in' | 'eq' | 'ne' | 'gt' | 'lt' | 'ge' | 'le';

type Atom =
  | { type: 'field'; field: FieldName }
  | { type: 'string'; value: string }
  | { type: 'list'; values: string[] };

type ExpressionNode =
  | { type: 'and' | 'or'; left: ExpressionNode; right: ExpressionNode }
  | { type: 'compare'; op: CompareOp; left: Atom; right: Atom };

type Token = {
  type:
    | 'word'
    | 'string'
    | 'operator'
    | 'lparen'
    | 'rparen'
    | 'lbracket'
    | 'rbracket'
    | 'comma'
    | 'eof';
  value: string;
};

type ExpressionErrorArgs = Record<string, string | number>;

type InvalidExpression = (key: string, args?: ExpressionErrorArgs) => never;

const DATE_FIELDS = new Set<FieldName>([
  SmartFolderField.CREATED_AT,
  SmartFolderField.UPDATED_AT,
]);

const FIELDS = new Set<string>([
  SmartFolderField.TITLE,
  SmartFolderField.TAGS,
  SmartFolderField.URL,
  SmartFolderField.FILE_NAME,
  SmartFolderField.FILE_NAME_EXT,
  SmartFolderField.CONTENT,
  SmartFolderField.CREATED_AT,
  SmartFolderField.UPDATED_AT,
]);

const FIELD_LIST =
  'title, tags, url, file_name, file_name_ext, content, created_at, updated_at';
const OPERATOR_LIST = 'in, not in, ==, !=, >, <, >=, <=';
const DATETIME_FORMAT = 'YYYY-MM-DD HH:MM:SS';
const DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
const DEFAULT_TIME_ZONE = 'UTC';

const MAX_LENGTH = 2000;
const MAX_DEPTH = 20;

@Injectable()
export class SmartFolderExpressionService {
  constructor(private readonly i18n: I18nService) {}

  parse(expression: string): ExpressionNode {
    if (!expression.trim()) {
      this.invalid('empty');
    }
    if (expression.length > MAX_LENGTH) {
      this.invalid('tooLong', { max: MAX_LENGTH });
    }

    const parser = new ExpressionParser(
      this.tokenize(expression),
      (key, args) => this.invalid(key, args),
    );
    const result = parser.parse();
    if (parser.maxDepth > MAX_DEPTH) {
      this.invalid('tooDeep', { max: MAX_DEPTH });
    }
    return result;
  }

  matches(resource: Resource, expression: string, timeZone?: string): boolean {
    return this.evaluate(
      resource,
      this.parse(expression),
      this.resolveTimeZone(timeZone),
    );
  }

  private evaluate(
    resource: Resource,
    node: ExpressionNode,
    timeZone: string,
  ): boolean {
    if (node.type === 'and') {
      return (
        this.evaluate(resource, node.left, timeZone) &&
        this.evaluate(resource, node.right, timeZone)
      );
    }
    if (node.type === 'or') {
      return (
        this.evaluate(resource, node.left, timeZone) ||
        this.evaluate(resource, node.right, timeZone)
      );
    }
    if (node.type !== 'compare') return false;
    return this.evaluateCompare(resource, node, timeZone);
  }

  private evaluateCompare(
    resource: Resource,
    node: Extract<ExpressionNode, { type: 'compare' }>,
    timeZone: string,
  ): boolean {
    const fieldAtom = this.fieldAtom(node.left, node.right);
    const valueAtom = fieldAtom === node.left ? node.right : node.left;
    const swapped = fieldAtom === node.right;
    const field = fieldAtom.field;
    const op = swapped ? this.swapOp(node.op) : node.op;

    if (DATE_FIELDS.has(field)) {
      return this.evaluateDate(resource, field, op, valueAtom, timeZone);
    }
    if (field === SmartFolderField.TAGS) {
      return this.evaluateTags(resource, op, valueAtom);
    }
    return this.evaluateText(resource, field, op, valueAtom);
  }

  private evaluateText(
    resource: Resource,
    field: FieldName,
    op: CompareOp,
    value: Atom,
  ): boolean {
    const candidate = this.textCandidate(resource, field);
    const normalize =
      field === SmartFolderField.FILE_NAME_EXT
        ? (item: string) => this.normalizeFileNameExtLiteral(item)
        : (item: string) => item.toLowerCase();
    if (op === 'in' || op === 'not_in') {
      const matched =
        value.type === 'string'
          ? candidate.includes(normalize(value.value))
          : this.literalValues(value).some(
              (item) => candidate === normalize(item),
            );
      return op === 'in' ? matched : !matched;
    }
    if (value.type !== 'string') return false;
    const expected = normalize(value.value);
    if (op === 'eq') return candidate === expected;
    if (op === 'ne') return candidate !== expected;
    return false;
  }

  private evaluateTags(
    resource: Resource,
    op: CompareOp,
    value: Atom,
  ): boolean {
    const tags = this.tagValues(resource);
    if (op === 'in' || op === 'not_in') {
      const needles = this.literalValues(value).map((item) =>
        item.toLowerCase(),
      );
      const matched = needles.some((item) => tags.includes(item));
      return op === 'in' ? matched : !matched;
    }
    if (op === 'eq' || op === 'ne') {
      const expected = this.literalValues(value).map((item) =>
        item.toLowerCase(),
      );
      const matched = this.sameSet(tags, expected);
      return op === 'eq' ? matched : !matched;
    }
    return false;
  }

  private evaluateDate(
    resource: Resource,
    field: FieldName,
    op: CompareOp,
    value: Atom,
    timeZone: string,
  ): boolean {
    const actual = this.dateCandidate(resource, field);
    if (!actual) return false;
    const actualSeconds = Math.floor(actual.getTime() / 1000);
    if (op === 'in' || op === 'not_in') {
      const expected = this.literalValues(value)
        .map((item) => this.parseDatetime(item, timeZone))
        .map((date) => Math.floor(date.getTime() / 1000));
      const matched = expected.includes(actualSeconds);
      return op === 'in' ? matched : !matched;
    }
    if (value.type !== 'string') return false;
    const expectedSeconds = Math.floor(
      this.parseDatetime(value.value, timeZone).getTime() / 1000,
    );
    if (op === 'eq') return actualSeconds === expectedSeconds;
    if (op === 'ne') return actualSeconds !== expectedSeconds;
    if (op === 'gt') return actualSeconds > expectedSeconds;
    if (op === 'lt') return actualSeconds < expectedSeconds;
    if (op === 'ge') return actualSeconds >= expectedSeconds;
    if (op === 'le') return actualSeconds <= expectedSeconds;
    return false;
  }

  private textCandidate(resource: Resource, field: FieldName): string {
    if (field === SmartFolderField.TITLE) {
      return (resource.name || '').toLowerCase();
    }
    if (field === SmartFolderField.FILE_NAME) {
      return this.fileName(resource).toLowerCase();
    }
    if (field === SmartFolderField.FILE_NAME_EXT) {
      return this.fileNameExt(this.fileName(resource));
    }
    if (field === SmartFolderField.CONTENT) {
      return [
        resource.content,
        resource.attrs?.transcript,
        resource.attrs?.parsed_content,
        resource.attrs?.description,
        resource.attrs?.summary,
        resource.attrs?.text,
      ]
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .join('\n')
        .toLowerCase();
    }
    if (field === SmartFolderField.URL) {
      if (resource.resourceType === ResourceType.RSS_ITEM) {
        return String(resource.attrs?.article_url ?? '').toLowerCase();
      }
      if (resource.resourceType !== ResourceType.LINK) return '';
      return String(resource.attrs?.url || '').toLowerCase();
    }
    return '';
  }

  private fileName(resource: Resource): string {
    return String(
      resource.attrs?.original_name || resource.attrs?.filename || '',
    );
  }

  private fileNameExt(fileName: string): string {
    const base = fileName.trim().toLowerCase();
    const lastDot = base.lastIndexOf('.');
    if (lastDot <= 0 || lastDot === base.length - 1) return '';
    return base.slice(lastDot + 1);
  }

  private normalizeFileNameExtLiteral(value: string): string {
    const normalized = value.trim().toLowerCase();
    return normalized.startsWith('.') ? normalized.slice(1) : normalized;
  }

  private tagValues(resource: Resource): string[] {
    const names = [resource.attrs?.tags, resource.attrs?.tag_names]
      .flatMap((value) => (Array.isArray(value) ? value : []))
      .map((value) =>
        typeof value === 'string'
          ? value
          : typeof value?.name === 'string'
            ? value.name
            : '',
      )
      .filter((value) => value.length > 0);
    return [...(resource.tagIds || []), ...names].map((value) =>
      value.toLowerCase(),
    );
  }

  private dateCandidate(resource: Resource, field: FieldName): Date | null {
    if (field === SmartFolderField.CREATED_AT)
      return resource.createdAt ?? null;
    if (field === SmartFolderField.UPDATED_AT)
      return resource.updatedAt ?? null;
    return null;
  }

  private parseDatetime(value: string, timeZone: string): Date {
    const date = parseZonedDatetime(value, timeZone);
    if (!date) {
      this.invalid('invalidDatetimeWithTimezone', {
        value,
        format: DATETIME_FORMAT,
        timezone: timeZone,
      });
    }
    return date;
  }

  private resolveTimeZone(timeZone?: string): string {
    const resolved = timeZone?.trim() || DEFAULT_TIME_ZONE;
    if (!isValidTimeZone(resolved)) {
      this.invalid('unknownTimezone', { timezone: resolved });
    }
    return resolved;
  }

  private literalValues(value: Atom): string[] {
    if (value.type === 'string') return [value.value];
    if (value.type === 'list') return value.values;
    return [];
  }

  private fieldAtom(left: Atom, right: Atom): Extract<Atom, { type: 'field' }> {
    if (left.type === 'field') return left;
    if (right.type === 'field') return right;
    this.invalid('compareOneField');
  }

  private swapOp(op: CompareOp): CompareOp {
    if (op === 'gt') return 'lt';
    if (op === 'lt') return 'gt';
    if (op === 'ge') return 'le';
    if (op === 'le') return 'ge';
    return op;
  }

  private sameSet(left: string[], right: string[]): boolean {
    const a = [...new Set(left)];
    const b = [...new Set(right)];
    return a.length === b.length && a.every((item) => b.includes(item));
  }

  private tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    for (let index = 0; index < input.length; ) {
      if (/\s/.test(input[index])) {
        index += 1;
        continue;
      }
      const char = input[index];
      if (
        char === '(' ||
        char === ')' ||
        char === '[' ||
        char === ']' ||
        char === ','
      ) {
        tokens.push({
          type:
            char === '('
              ? 'lparen'
              : char === ')'
                ? 'rparen'
                : char === '['
                  ? 'lbracket'
                  : char === ']'
                    ? 'rbracket'
                    : 'comma',
          value: char,
        });
        index += 1;
        continue;
      }
      if (char === '=' || char === '!' || char === '>' || char === '<') {
        const two = input.slice(index, index + 2);
        const value =
          two === '==' || two === '!=' || two === '>=' || two === '<='
            ? two
            : char;
        if (char === '!' && value !== '!=') {
          this.invalid('unknownExclamation');
        }
        tokens.push({ type: 'operator', value });
        index += value.length;
        continue;
      }
      if (char === "'" || char === '"') {
        const quote = char;
        let end = index + 1;
        let value = '';
        while (end < input.length && input[end] !== quote) {
          if (input[end] === '\\' && end + 1 < input.length) end += 1;
          value += input[end];
          end += 1;
        }
        if (input[end] !== quote) {
          this.invalid('unterminatedString', { index, quote });
        }
        tokens.push({ type: 'string', value });
        index = end + 1;
        continue;
      }
      const match = input.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (!match) {
        this.invalid('unexpectedCharacter', { char, index });
      }
      const value = match[0].toLowerCase();
      tokens.push({
        type:
          value === 'and' || value === 'or' || value === 'in'
            ? 'operator'
            : 'word',
        value,
      });
      index += match[0].length;
    }
    tokens.push({ type: 'eof', value: '' });
    return tokens;
  }

  private invalid(key: string, args: ExpressionErrorArgs = {}): never {
    const i18nKey = `resource.errors.smartFolderExpression.${key}`;
    const hintArgs = {
      fields: FIELD_LIST,
      operators: OPERATOR_LIST,
      format: DATETIME_FORMAT,
    };
    const message = this.i18n.t(i18nKey, { args });
    const reason = this.i18n.t(i18nKey, { args, lang: 'en' });
    const hint = this.i18n.t('resource.errors.smartFolderExpression.hint', {
      args: hintArgs,
    });
    throw new AppException(
      missingTranslation(message, i18nKey) ? String(reason) : String(message),
      'SMART_FOLDER_EXPRESSION_INVALID',
      HttpStatus.UNPROCESSABLE_ENTITY,
      {
        reason: String(reason),
        hint: String(hint),
        error: errorCode(key),
      },
    );
  }
}

class ExpressionParser {
  private index = 0;
  private depth = 0;
  maxDepth = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly invalid: InvalidExpression,
  ) {}

  parse(): ExpressionNode {
    const result = this.parseOr();
    if (this.peek().type !== 'eof') {
      this.invalid('unexpectedToken', {
        token: this.peek().value || this.peek().type,
      });
    }
    return result;
  }

  private parseOr(): ExpressionNode {
    let result = this.parseAnd();
    while (this.acceptOperator('or')) {
      result = { type: 'or', left: result, right: this.parseAnd() };
    }
    return result;
  }

  private parseAnd(): ExpressionNode {
    let result = this.parseComparison();
    while (this.acceptOperator('and')) {
      result = { type: 'and', left: result, right: this.parseComparison() };
    }
    return result;
  }

  private parseComparison(): ExpressionNode {
    if (this.acceptType('lparen')) {
      this.depth += 1;
      this.maxDepth = Math.max(this.maxDepth, this.depth);
      const result = this.parseOr();
      this.depth -= 1;
      if (!this.acceptType('rparen')) {
        this.invalid('missingRparen');
      }
      return result;
    }
    const left = this.parseAtom();
    const op = this.parseOperator();
    const right = this.parseAtom();
    this.validateComparison(left, op, right);
    return { type: 'compare', op, left, right };
  }

  private parseAtom(): Atom {
    if (this.acceptType('lbracket')) return this.parseList();
    const token = this.next();
    if (token.type === 'string') return { type: 'string', value: token.value };
    if (token.type === 'word') {
      const fieldName = token.value;
      if (!FIELDS.has(fieldName)) {
        this.invalid('unknownField', {
          field: token.value,
          fields: FIELD_LIST,
        });
      }
      return { type: 'field', field: fieldName as FieldName };
    }
    this.invalid('expectedAtom', { got: token.value || token.type });
  }

  private parseList(): Extract<Atom, { type: 'list' }> {
    const values: string[] = [];
    if (this.acceptType('rbracket')) return { type: 'list', values };
    while (true) {
      const token = this.next();
      if (token.type !== 'string') {
        this.invalid('listOnlyStrings');
      }
      values.push(token.value);
      if (this.acceptType('comma')) {
        if (this.peek().type === 'rbracket') {
          this.next();
          break;
        }
        continue;
      }
      if (this.acceptType('rbracket')) break;
      this.invalid('expectedListSeparator');
    }
    return { type: 'list', values };
  }

  private parseOperator(): CompareOp {
    const token = this.peek();
    if (token.value === 'not') {
      this.next();
      if (this.next().value !== 'in') {
        this.invalid('expectedInAfterNot');
      }
      return 'not_in';
    }
    this.next();
    if (token.value === 'in') return 'in';
    if (token.value === '==') return 'eq';
    if (token.value === '!=') return 'ne';
    if (token.value === '>') return 'gt';
    if (token.value === '<') return 'lt';
    if (token.value === '>=') return 'ge';
    if (token.value === '<=') return 'le';
    this.invalid('unknownOperator', {
      operator: token.value || token.type,
      operators: OPERATOR_LIST,
    });
  }

  private validateComparison(left: Atom, op: CompareOp, right: Atom) {
    const fieldCount =
      Number(left.type === 'field') + Number(right.type === 'field');
    if (fieldCount !== 1) {
      this.invalid('compareOneField');
    }
    const field =
      left.type === 'field'
        ? left.field
        : right.type === 'field'
          ? right.field
          : this.invalid('compareOneField');
    const value = left.type === 'field' ? right : left;
    const fieldOnLeft = left.type === 'field';

    if (DATE_FIELDS.has(field)) {
      this.validateDateComparison(field, op, value, fieldOnLeft);
      return;
    }
    if (op === 'gt' || op === 'lt' || op === 'ge' || op === 'le') {
      this.invalid('compareOnlyDatetime', { operator: opSymbol(op) });
    }
    if (op === 'in' || op === 'not_in') {
      this.validateInComparison(field, op, value, fieldOnLeft);
      return;
    }
    if (value.type === 'list' && field !== SmartFolderField.TAGS) {
      this.invalid('equalityNotList', {
        field,
        operator: opSymbol(op),
      });
    }
    if (value.type !== 'string' && field !== SmartFolderField.TAGS) {
      this.invalid('equalityNeedsString', {
        field,
        operator: opSymbol(op),
      });
    }
  }

  private validateDateComparison(
    field: FieldName,
    op: CompareOp,
    value: Atom,
    fieldOnLeft: boolean,
  ) {
    if (op === 'in' || op === 'not_in') {
      if (!fieldOnLeft || value.type !== 'list') {
        this.invalid('dateInNeedsList', {
          field,
          format: DATETIME_FORMAT,
        });
      }
      value.values.forEach((item) => this.assertDatetime(item));
      return;
    }
    if (value.type !== 'string') {
      this.invalid('dateNeedsString', {
        field,
        operator: opSymbol(op),
        format: DATETIME_FORMAT,
      });
    }
    this.assertDatetime(value.value);
  }

  private validateInComparison(
    field: FieldName,
    op: CompareOp,
    value: Atom,
    fieldOnLeft: boolean,
  ) {
    const keyword = op === 'in' ? 'in' : 'not in';
    if (fieldOnLeft && value.type !== 'list') {
      this.invalid('inFieldNeedsList', { field, keyword });
    }
    if (!fieldOnLeft && value.type !== 'string') {
      this.invalid('inValueNeedsString', { field, keyword });
    }
  }

  private assertDatetime(value: string) {
    if (!isDatetimeLiteral(value)) {
      this.invalid('invalidDatetime', {
        value,
        format: DATETIME_FORMAT,
      });
    }
  }

  private acceptOperator(value: string) {
    if (this.peek().value !== value || this.peek().type !== 'operator') {
      return false;
    }
    this.index += 1;
    return true;
  }

  private acceptType(type: Token['type']) {
    if (this.peek().type !== type) return false;
    this.index += 1;
    return true;
  }

  private next() {
    const token = this.peek();
    this.index += 1;
    return token;
  }

  private peek() {
    return this.tokens[this.index];
  }
}

function isDatetimeLiteral(value: string): boolean {
  const parts = datetimeParts(value);
  if (!parts) return false;
  const date = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ),
  );
  return (
    date.getUTCFullYear() === parts.year &&
    date.getUTCMonth() === parts.month - 1 &&
    date.getUTCDate() === parts.day &&
    date.getUTCHours() === parts.hour &&
    date.getUTCMinutes() === parts.minute &&
    date.getUTCSeconds() === parts.second
  );
}

function datetimeParts(value: string) {
  const match = value.match(DATETIME_PATTERN);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  };
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function parseZonedDatetime(value: string, timeZone: string): Date | null {
  const parts = datetimeParts(value);
  if (!parts || !isDatetimeLiteral(value) || !isValidTimeZone(timeZone)) {
    return null;
  }
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  let instant = utcGuess - offset;
  offset = getTimeZoneOffsetMs(new Date(instant), timeZone);
  instant = utcGuess - offset;
  const wall = wallClockParts(new Date(instant), timeZone);
  if (
    !wall ||
    wall.year !== parts.year ||
    wall.month !== parts.month ||
    wall.day !== parts.day ||
    wall.hour !== parts.hour ||
    wall.minute !== parts.minute ||
    wall.second !== parts.second
  ) {
    return null;
  }
  return new Date(instant);
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const wall = wallClockParts(date, timeZone);
  if (!wall) return 0;
  return (
    Date.UTC(
      wall.year,
      wall.month - 1,
      wall.day,
      wall.hour,
      wall.minute,
      wall.second,
    ) - date.getTime()
  );
}

function wallClockParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = map.hour === '24' ? 0 : Number(map.hour);
  if (
    !map.year ||
    !map.month ||
    !map.day ||
    Number.isNaN(hour) ||
    !map.minute ||
    !map.second
  ) {
    return null;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function opSymbol(op: CompareOp): string {
  if (op === 'in') return 'in';
  if (op === 'not_in') return 'not in';
  if (op === 'eq') return '==';
  if (op === 'ne') return '!=';
  if (op === 'gt') return '>';
  if (op === 'lt') return '<';
  if (op === 'ge') return '>=';
  return '<=';
}

function errorCode(key: string): string {
  return key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

function missingTranslation(message: unknown, key: string): boolean {
  return typeof message !== 'string' || message === key;
}
