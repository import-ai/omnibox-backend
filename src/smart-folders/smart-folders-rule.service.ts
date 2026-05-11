import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import {
  SmartFolderCondition,
  SmartFolderField,
  SmartFolderOperator,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';

const TEXT_FIELDS = new Set<SmartFolderField>([
  SmartFolderField.TITLE,
  SmartFolderField.TAGS,
  SmartFolderField.URL,
  SmartFolderField.FILE_NAME,
  SmartFolderField.CONTENT,
]);

const TEXT_OPERATORS = new Set<SmartFolderOperator>([
  SmartFolderOperator.CONTAINS,
  SmartFolderOperator.NOT_CONTAINS,
  SmartFolderOperator.EQUALS,
  SmartFolderOperator.NOT_EQUALS,
  SmartFolderOperator.IS_EMPTY,
  SmartFolderOperator.IS_NOT_EMPTY,
]);

const DATE_OPERATORS = new Set<SmartFolderOperator>([
  SmartFolderOperator.RECENT,
  SmartFolderOperator.EARLIER_THAN,
  SmartFolderOperator.BEFORE,
  SmartFolderOperator.AFTER,
  SmartFolderOperator.ON,
  SmartFolderOperator.NOT_ON,
  SmartFolderOperator.BETWEEN,
]);

const VALUELESS_OPERATORS = new Set<SmartFolderOperator>([
  SmartFolderOperator.IS_EMPTY,
  SmartFolderOperator.IS_NOT_EMPTY,
]);

@Injectable()
export class SmartFoldersRuleService {
  normalize(conditions: SmartFolderCondition[] = []): SmartFolderCondition[] {
    return conditions
      .filter((condition) => condition.field)
      .map((condition) => this.normalizeCondition(condition));
  }

  private normalizeCondition(
    condition: SmartFolderCondition,
  ): SmartFolderCondition {
    if (!condition.field || !condition.operator) {
      this.throwIncomplete();
    }

    const field = condition.field;
    const operator = condition.operator;
    const isTextField = TEXT_FIELDS.has(field);
    const isDateField = field === SmartFolderField.CREATED_AT;

    if (
      (isTextField && !TEXT_OPERATORS.has(operator)) ||
      (isDateField && !DATE_OPERATORS.has(operator))
    ) {
      throw new AppException(
        'Invalid smart folder condition operator',
        'SMART_FOLDER_CONDITION_OPERATOR_INVALID',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (VALUELESS_OPERATORS.has(operator)) {
      return { field, operator };
    }

    if (condition.value === undefined || condition.value === null) {
      this.throwIncomplete();
    }

    if (isTextField && typeof condition.value !== 'string') {
      this.throwIncomplete();
    }

    if (operator === SmartFolderOperator.BETWEEN) {
      const value = condition.value;
      if (typeof value !== 'object') {
        this.throwIncomplete();
      }

      const startDate = value.start_date || value.startDate;
      const endDate = value.end_date || value.endDate;
      if (!startDate || !endDate) {
        this.throwIncomplete();
      }

      return {
        field,
        operator,
        value:
          endDate < startDate
            ? { start_date: endDate, end_date: startDate }
            : { start_date: startDate, end_date: endDate },
      };
    }

    return condition;
  }

  private throwIncomplete(): never {
    throw new AppException(
      'Please complete this smart folder condition',
      'SMART_FOLDER_CONDITION_INCOMPLETE',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
