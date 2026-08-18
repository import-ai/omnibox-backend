import { Injectable } from '@nestjs/common';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import {
  SmartFolderCondition,
  SmartFolderField,
  SmartFolderMatchMode,
  SmartFolderOperator,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';

@Injectable()
export class SmartFoldersMatcherService {
  matches(
    resource: Resource,
    conditions: SmartFolderCondition[],
    matchMode: SmartFolderMatchMode,
  ): boolean {
    if (conditions.length <= 0) {
      return false;
    }
    const matcher = (condition: SmartFolderCondition) =>
      this.matchesCondition(resource, condition);
    return matchMode === SmartFolderMatchMode.ANY
      ? conditions.some(matcher)
      : conditions.every(matcher);
  }

  private matchesCondition(
    resource: Resource,
    condition: SmartFolderCondition,
  ): boolean {
    const dateCandidate = this.getDateCandidate(resource, condition.field);
    if (dateCandidate) {
      return this.matchesDateCondition(dateCandidate, condition);
    }

    if (
      condition.field === SmartFolderField.URL &&
      resource.resourceType !== ResourceType.LINK
    ) {
      return false;
    }

    const operator = condition.operator;
    const candidate = this.getConditionCandidate(resource, condition.field);
    const expected = this.getConditionTextValue(condition);

    switch (operator) {
      case SmartFolderOperator.CONTAINS:
        return candidate.includes(expected);
      case SmartFolderOperator.NOT_CONTAINS:
        return !candidate.includes(expected);
      case SmartFolderOperator.EQUALS:
        return candidate === expected;
      case SmartFolderOperator.NOT_EQUALS:
        return candidate !== expected;
      case SmartFolderOperator.IS_EMPTY:
        return candidate.length <= 0;
      case SmartFolderOperator.IS_NOT_EMPTY:
        return candidate.length > 0;
      default:
        return false;
    }
  }

  private getConditionTextValue(condition: SmartFolderCondition): string {
    return typeof condition.value === 'string'
      ? condition.value.toLowerCase()
      : '';
  }

  private getDateCandidate(
    resource: Resource,
    field?: SmartFolderField,
  ): Date | null {
    switch (field) {
      case SmartFolderField.CREATED_AT:
        return resource.createdAt;
      case SmartFolderField.UPDATED_AT:
        return resource.updatedAt;
      default:
        return null;
    }
  }

  private getConditionCandidate(
    resource: Resource,
    field?: SmartFolderField,
  ): string {
    switch (field) {
      case SmartFolderField.TITLE:
        return (resource.name || '').toLowerCase();
      case SmartFolderField.URL:
        return String(resource.attrs?.url || '').toLowerCase();
      case SmartFolderField.FILE_NAME:
        return String(
          resource.attrs?.original_name || resource.attrs?.filename || '',
        ).toLowerCase();
      case SmartFolderField.CONTENT:
        return this.getContentCandidate(resource);
      case SmartFolderField.TAGS:
        return this.getTagsCandidate(resource);
      default:
        return '';
    }
  }

  private matchesDateCondition(
    createdAt: Date,
    condition: SmartFolderCondition,
  ): boolean {
    const operator = condition.operator;
    const value =
      typeof condition.value === 'object' && condition.value !== null
        ? condition.value
        : {};
    const createdAtTime = createdAt.getTime();

    switch (operator) {
      case SmartFolderOperator.RECENT: {
        const since = this.getRecentSince(value.amount, value.unit);
        return since === null ? false : createdAtTime >= since.getTime();
      }
      case SmartFolderOperator.EARLIER_THAN: {
        const since = this.getRecentSince(value.amount, value.unit);
        return since === null ? false : createdAtTime < since.getTime();
      }
      case SmartFolderOperator.BEFORE: {
        const range = this.getDayRange(value.date);
        return range === null ? false : createdAtTime < range.start.getTime();
      }
      case SmartFolderOperator.AFTER: {
        const range = this.getDayRange(value.date);
        return range === null ? false : createdAtTime >= range.end.getTime();
      }
      case SmartFolderOperator.ON: {
        const range = this.getDayRange(value.date);
        return range === null
          ? false
          : createdAtTime >= range.start.getTime() &&
              createdAtTime < range.end.getTime();
      }
      case SmartFolderOperator.NOT_ON: {
        const range = this.getDayRange(value.date);
        return range === null
          ? false
          : createdAtTime < range.start.getTime() ||
              createdAtTime >= range.end.getTime();
      }
      case SmartFolderOperator.BETWEEN: {
        const start = this.getDayRange(value.start_date || value.startDate);
        const end = this.getDayRange(value.end_date || value.endDate);
        return start === null || end === null
          ? false
          : createdAtTime >= start.start.getTime() &&
              createdAtTime < end.end.getTime();
      }
      default:
        return false;
    }
  }

  private getRecentSince(
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

  private getDayRange(date?: string): { start: Date; end: Date } | null {
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

  private getTagsCandidate(resource: Resource): string {
    const values = [...(resource.tagIds || [])];
    const tagNames = [resource.attrs?.tags, resource.attrs?.tag_names]
      .flatMap((value) => (Array.isArray(value) ? value : []))
      .map((value) =>
        typeof value === 'string'
          ? value
          : typeof value?.name === 'string'
            ? value.name
            : '',
      )
      .filter((value) => value.length > 0);

    return [...values, ...tagNames].join(' ').toLowerCase();
  }

  private getContentCandidate(resource: Resource): string {
    const parts = [
      resource.content,
      resource.attrs?.transcript,
      resource.attrs?.parsed_content,
      resource.attrs?.description,
      resource.attrs?.summary,
      resource.attrs?.text,
    ];

    return parts
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .join('\n')
      .toLowerCase();
  }
}
