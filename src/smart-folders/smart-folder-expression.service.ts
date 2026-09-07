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

const DATE_FIELDS = new Set<FieldName>([
  SmartFolderField.CREATED_AT,
  SmartFolderField.UPDATED_AT,
]);

const FIELDS = new Set<string>([
  SmartFolderField.TITLE,
  SmartFolderField.TAGS,
  SmartFolderField.URL,
  SmartFolderField.FILE_NAME,
  SmartFolderField.CONTENT,
  SmartFolderField.CREATED_AT,
  SmartFolderField.UPDATED_AT,
]);

const FIELD_LIST =
  'title, tags, url, file_name, content, created_at, updated_at';
const OPERATOR_LIST = 'in, not in, ==, !=, >, <, >=, <=';
const DATETIME_FORMAT = 'YYYY-MM-DD HH:MM:SS';
const DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
const SYNTAX_HINT = [
  `Allowed fields: ${FIELD_LIST}. tag is an alias of tags.`,
  `Operators: ${OPERATOR_LIST}. Combine with and / or and parentheses.`,
  "Text examples: 'foo' in title; title in ['foo', 'bar']; title == 'foo'.",
  `Datetime fields created_at and updated_at use UTC ${DATETIME_FORMAT}, e.g. created_at >= '2026-09-08 00:00:00'.`,
].join(' ');

const MAX_LENGTH = 2000;
const MAX_DEPTH = 20;

@Injectable()
export class SmartFolderExpressionService {
  constructor(private readonly i18n: I18nService) {}

  parse(expression: string): ExpressionNode {
    if (!expression.trim()) {
      this.invalid('Expression is empty. ' + SYNTAX_HINT);
    }
    if (expression.length > MAX_LENGTH) {
      this.invalid(
        `Expression exceeds ${MAX_LENGTH} characters. Shorten it and retry.`,
      );
    }

    const parser = new ExpressionParser(this.tokenize(expression), (reason) =>
      this.invalid(reason),
    );
    const result = parser.parse();
    if (parser.maxDepth > MAX_DEPTH) {
      this.invalid(
        `Expression is nested more than ${MAX_DEPTH} levels. Flatten and / or groups.`,
      );
    }
    return result;
  }

  matches(resource: Resource, expression: string): boolean {
    return this.evaluate(resource, this.parse(expression));
  }

  private evaluate(resource: Resource, node: ExpressionNode): boolean {
    if (node.type === 'and') {
      return (
        this.evaluate(resource, node.left) &&
        this.evaluate(resource, node.right)
      );
    }
    if (node.type === 'or') {
      return (
        this.evaluate(resource, node.left) ||
        this.evaluate(resource, node.right)
      );
    }
    if (node.type !== 'compare') return false;
    return this.evaluateCompare(resource, node);
  }

  private evaluateCompare(
    resource: Resource,
    node: Extract<ExpressionNode, { type: 'compare' }>,
  ): boolean {
    const fieldAtom = this.fieldAtom(node.left, node.right);
    const valueAtom = fieldAtom === node.left ? node.right : node.left;
    const swapped = fieldAtom === node.right;
    const field = fieldAtom.field;
    const op = swapped ? this.swapOp(node.op) : node.op;

    if (DATE_FIELDS.has(field)) {
      return this.evaluateDate(resource, field, op, valueAtom);
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
    if (op === 'in' || op === 'not_in') {
      const matched =
        value.type === 'string'
          ? candidate.includes(value.value.toLowerCase())
          : this.literalValues(value).some(
              (item) => candidate === item.toLowerCase(),
            );
      return op === 'in' ? matched : !matched;
    }
    if (value.type !== 'string') return false;
    const expected = value.value.toLowerCase();
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
  ): boolean {
    const actual = this.dateCandidate(resource, field);
    if (!actual) return false;
    const actualSeconds = Math.floor(actual.getTime() / 1000);
    if (op === 'in' || op === 'not_in') {
      const expected = this.literalValues(value)
        .map((item) => this.parseDatetime(item))
        .map((date) => Math.floor(date.getTime() / 1000));
      const matched = expected.includes(actualSeconds);
      return op === 'in' ? matched : !matched;
    }
    if (value.type !== 'string') return false;
    const expectedSeconds = Math.floor(
      this.parseDatetime(value.value).getTime() / 1000,
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
      return String(
        resource.attrs?.original_name || resource.attrs?.filename || '',
      ).toLowerCase();
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

  private parseDatetime(value: string): Date {
    const date = parseUtcDatetime(value);
    if (!date) this.invalid(this.datetimeError(value));
    return date;
  }

  private datetimeError(value: string): string {
    return `Invalid datetime '${value}'. Use UTC ${DATETIME_FORMAT}, e.g. created_at >= '2026-09-08 00:00:00'.`;
  }

  private literalValues(value: Atom): string[] {
    if (value.type === 'string') return [value.value];
    if (value.type === 'list') return value.values;
    return [];
  }

  private fieldAtom(left: Atom, right: Atom): Extract<Atom, { type: 'field' }> {
    if (left.type === 'field') return left;
    if (right.type === 'field') return right;
    this.invalid('Compare exactly one field with a literal. ' + SYNTAX_HINT);
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
          this.invalid(
            "Unknown operator '!'. Use != for inequality. " + SYNTAX_HINT,
          );
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
          this.invalid(
            `Unterminated string starting at index ${index}. Close it with ${quote}.`,
          );
        }
        tokens.push({ type: 'string', value });
        index = end + 1;
        continue;
      }
      const match = input.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (!match) {
        this.invalid(
          `Unexpected character '${char}' at index ${index}. ${SYNTAX_HINT}`,
        );
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

  private invalid(reason: string): never {
    const message = this.i18n.t(
      'resource.errors.smartFolderExpressionInvalid',
      {
        args: { reason },
      },
    );
    throw new AppException(
      message.includes('{reason}') ||
        message === 'resource.errors.smartFolderExpressionInvalid'
        ? reason
        : message,
      'SMART_FOLDER_EXPRESSION_INVALID',
      HttpStatus.UNPROCESSABLE_ENTITY,
      { reason, hint: SYNTAX_HINT },
    );
  }
}

class ExpressionParser {
  private index = 0;
  private depth = 0;
  maxDepth = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly invalid: (reason: string) => never,
  ) {}

  parse(): ExpressionNode {
    const result = this.parseOr();
    if (this.peek().type !== 'eof') {
      this.invalid(
        `Unexpected token '${this.peek().value || this.peek().type}' after a complete expression. ${SYNTAX_HINT}`,
      );
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
        this.invalid("Missing ')'. Close the grouped expression.");
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
      const fieldName =
        token.value === 'tag' ? SmartFolderField.TAGS : token.value;
      if (!FIELDS.has(fieldName)) {
        this.invalid(
          `Unknown field '${token.value}'. Allowed fields: ${FIELD_LIST}.`,
        );
      }
      return { type: 'field', field: fieldName as FieldName };
    }
    this.invalid(
      `Expected a field, string, or list, got '${token.value || token.type}'. ${SYNTAX_HINT}`,
    );
  }

  private parseList(): Extract<Atom, { type: 'list' }> {
    const values: string[] = [];
    if (this.acceptType('rbracket')) return { type: 'list', values };
    while (true) {
      const token = this.next();
      if (token.type !== 'string') {
        this.invalid(
          "Lists may only contain quoted strings, e.g. title in ['foo', 'bar'].",
        );
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
      this.invalid("Expected ',' or ']' in list, e.g. ['foo', 'bar'].");
    }
    return { type: 'list', values };
  }

  private parseOperator(): CompareOp {
    const token = this.peek();
    if (token.value === 'not') {
      this.next();
      if (this.next().value !== 'in') {
        this.invalid("Expected 'in' after 'not'. Use: 'foo' not in title.");
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
    if (token.value === '=') {
      this.invalid("Use == instead of =. Example: title == 'foo'.");
    }
    if (token.value === 'includes') {
      this.invalid("Use in instead of includes. Example: 'foo' in title.");
    }
    this.invalid(
      `Unknown operator '${token.value || token.type}'. Allowed operators: ${OPERATOR_LIST}.`,
    );
  }

  private validateComparison(left: Atom, op: CompareOp, right: Atom) {
    const fieldCount =
      Number(left.type === 'field') + Number(right.type === 'field');
    if (fieldCount !== 1) {
      this.invalid('Compare exactly one field with a literal. ' + SYNTAX_HINT);
    }
    const field =
      left.type === 'field'
        ? left.field
        : right.type === 'field'
          ? right.field
          : this.invalid(
              'Compare exactly one field with a literal. ' + SYNTAX_HINT,
            );
    const value = left.type === 'field' ? right : left;
    const fieldOnLeft = left.type === 'field';

    if (DATE_FIELDS.has(field)) {
      this.validateDateComparison(field, op, value, fieldOnLeft);
      return;
    }
    if (op === 'gt' || op === 'lt' || op === 'ge' || op === 'le') {
      this.invalid(
        `'${opSymbol(op)}' only applies to created_at and updated_at. Example: created_at >= '2026-09-08 00:00:00'.`,
      );
    }
    if (op === 'in' || op === 'not_in') {
      this.validateInComparison(field, op, value, fieldOnLeft);
      return;
    }
    if (value.type === 'list' && field !== SmartFolderField.TAGS) {
      this.invalid(
        `Use ${field} ${opSymbol(op)} 'value' for a single value, or ${field} in ['a', 'b'] for a list.`,
      );
    }
    if (value.type !== 'string' && field !== SmartFolderField.TAGS) {
      this.invalid(
        `${field} ${opSymbol(op)} requires a quoted string, e.g. ${field} == 'foo'.`,
      );
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
        this.invalid(
          `Use ${field} in ['${DATETIME_FORMAT}', ...] to match one of several datetimes.`,
        );
      }
      value.values.forEach((item) => this.assertDatetime(item));
      return;
    }
    if (value.type !== 'string') {
      this.invalid(
        `${field} ${opSymbol(op)} requires a datetime string '${DATETIME_FORMAT}'.`,
      );
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
      this.invalid(
        `When the field is on the left, use a list: ${field} ${keyword} ['foo', 'bar']. For substring match, use: 'foo' ${keyword} ${field}.`,
      );
    }
    if (!fieldOnLeft && value.type !== 'string') {
      this.invalid(
        `When the value is on the left, use a quoted string: 'foo' ${keyword} ${field}.`,
      );
    }
  }

  private assertDatetime(value: string) {
    if (!parseUtcDatetime(value)) {
      this.invalid(
        `Invalid datetime '${value}'. Use UTC ${DATETIME_FORMAT}, e.g. created_at >= '2026-09-08 00:00:00'.`,
      );
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

function parseUtcDatetime(value: string): Date | null {
  const match = value.match(DATETIME_PATTERN);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day) ||
    date.getUTCHours() !== Number(hour) ||
    date.getUTCMinutes() !== Number(minute) ||
    date.getUTCSeconds() !== Number(second)
  ) {
    return null;
  }
  return date;
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
