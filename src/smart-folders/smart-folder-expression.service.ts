import { HttpStatus, Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';

import {
  SmartFolderField,
  SmartFolderOperator,
} from './entities/smart-folder-config.entity';

type ExpressionNode =
  | { type: 'and' | 'or'; left: ExpressionNode; right: ExpressionNode }
  | {
      type: 'condition';
      field: SmartFolderField;
      operator: SmartFolderOperator;
      value?: string;
    };

type Token = {
  type: 'word' | 'string' | 'operator' | 'lparen' | 'rparen' | 'eof';
  value: string;
};

const FIELDS = new Set<SmartFolderField>([
  SmartFolderField.TITLE,
  SmartFolderField.TAGS,
  SmartFolderField.URL,
  SmartFolderField.FILE_NAME,
  SmartFolderField.CONTENT,
]);

const MAX_LENGTH = 2000;
const MAX_DEPTH = 20;

@Injectable()
export class SmartFolderExpressionService {
  constructor(private readonly i18n: I18nService) {}

  parse(expression: string): ExpressionNode {
    if (!expression.trim() || expression.length > MAX_LENGTH) {
      this.invalid();
    }

    const parser = new ExpressionParser(this.tokenize(expression), () =>
      this.invalid(),
    );
    const result = parser.parse();
    if (parser.maxDepth > MAX_DEPTH) {
      this.invalid();
    }
    return result;
  }

  matches(resource: Resource, expression: string): boolean {
    return this.evaluate(resource, this.parse(expression));
  }

  private evaluate(resource: Resource, node: ExpressionNode): boolean {
    if (node.type === 'and')
      return (
        this.evaluate(resource, node.left) &&
        this.evaluate(resource, node.right)
      );
    if (node.type === 'or')
      return (
        this.evaluate(resource, node.left) ||
        this.evaluate(resource, node.right)
      );
    if (node.type !== 'condition') return false;

    const candidate = this.candidate(resource, node.field);
    const expected = node.value?.toLowerCase() || '';
    switch (node.operator) {
      case SmartFolderOperator.CONTAINS:
        return candidate.includes(expected);
      case SmartFolderOperator.NOT_CONTAINS:
        return !candidate.includes(expected);
      case SmartFolderOperator.EQUALS:
        return candidate === expected;
      case SmartFolderOperator.NOT_EQUALS:
        return candidate !== expected;
      case SmartFolderOperator.IS_EMPTY:
        return !candidate;
      case SmartFolderOperator.IS_NOT_EMPTY:
        return !!candidate;
      default:
        return false;
    }
  }

  private candidate(resource: Resource, field: SmartFolderField): string {
    if (field === SmartFolderField.TITLE)
      return (resource.name || '').toLowerCase();
    if (field === SmartFolderField.TAGS)
      return [...(resource.tagIds || []), ...(resource.attrs?.tag_names || [])]
        .join(' ')
        .toLowerCase();
    if (field === SmartFolderField.CONTENT)
      return String(resource.content || '').toLowerCase();
    if (field === SmartFolderField.FILE_NAME)
      return String(
        resource.attrs?.original_name || resource.attrs?.filename || '',
      ).toLowerCase();
    if (field === SmartFolderField.URL) {
      if (
        resource.resourceType !== ResourceType.LINK &&
        resource.resourceType !== ResourceType.RSS_ITEM
      )
        return '';
      return String(
        resource.resourceType === ResourceType.RSS_ITEM
          ? resource.attrs?.article_url
          : resource.attrs?.url || '',
      ).toLowerCase();
    }
    return '';
  }

  private tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    for (let index = 0; index < input.length; ) {
      if (/\s/.test(input[index])) {
        index += 1;
        continue;
      }
      const char = input[index];
      if (char === '(') {
        tokens.push({ type: 'lparen', value: char });
        index += 1;
        continue;
      }
      if (char === ')') {
        tokens.push({ type: 'rparen', value: char });
        index += 1;
        continue;
      }
      if (char === '=' || char === '!') {
        const value = input.slice(index, index + 2) === '!=' ? '!=' : '=';
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
        if (input[end] !== quote) this.invalid();
        tokens.push({ type: 'string', value });
        index = end + 1;
        continue;
      }
      const match = input.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (!match) this.invalid();
      const value = match[0].toLowerCase();
      tokens.push({
        type:
          value === 'and' || value === 'or' || value === 'includes'
            ? 'operator'
            : 'word',
        value,
      });
      index += match[0].length;
    }
    tokens.push({ type: 'eof', value: '' });
    return tokens;
  }

  private invalid(): never {
    throw new AppException(
      this.i18n.t('resource.errors.smartFolderExpressionInvalid'),
      'SMART_FOLDER_EXPRESSION_INVALID',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

class ExpressionParser {
  private index = 0;
  private depth = 0;
  maxDepth = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly invalid: () => never,
  ) {}
  parse(): ExpressionNode {
    const result = this.parseOr();
    if (this.peek().type !== 'eof') this.invalid();
    return result;
  }
  private parseOr(): ExpressionNode {
    let result = this.parseAnd();
    while (this.accept('or'))
      result = { type: 'or', left: result, right: this.parseAnd() };
    return result;
  }
  private parseAnd(): ExpressionNode {
    let result = this.parsePrimary();
    while (this.accept('and'))
      result = { type: 'and', left: result, right: this.parsePrimary() };
    return result;
  }
  private parsePrimary(): ExpressionNode {
    if (this.accept('(')) {
      this.depth += 1;
      this.maxDepth = Math.max(this.maxDepth, this.depth);
      const result = this.parseOr();
      this.depth -= 1;
      if (!this.accept(')')) this.invalid();
      return result;
    }
    const field = this.next();
    const fieldName =
      field.value === 'tag' ? SmartFolderField.TAGS : field.value;
    if (field.type !== 'word' || !FIELDS.has(fieldName as SmartFolderField))
      this.invalid();
    const operator = this.next();
    if (operator.value === 'includes')
      return this.condition(
        fieldName as SmartFolderField,
        SmartFolderOperator.CONTAINS,
      );
    if (operator.value === 'not') {
      if (this.next().value !== 'includes') this.invalid();
      return this.condition(
        fieldName as SmartFolderField,
        SmartFolderOperator.NOT_CONTAINS,
      );
    }
    if (operator.value === '=' || operator.value === '!=')
      return this.condition(
        fieldName as SmartFolderField,
        operator.value === '='
          ? SmartFolderOperator.EQUALS
          : SmartFolderOperator.NOT_EQUALS,
      );
    this.invalid();
  }
  private condition(
    field: SmartFolderField,
    operator: SmartFolderOperator,
  ): ExpressionNode {
    const value = this.next();
    if (value.type !== 'string') this.invalid();
    return { type: 'condition', field, operator, value: value.value };
  }
  private accept(value: string) {
    if (this.peek().value !== value) return false;
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
