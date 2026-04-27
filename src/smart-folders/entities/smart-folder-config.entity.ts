import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export enum SmartFolderRootScope {
  PRIVATE = 'private',
  TEAMSPACE = 'teamspace',
}

export enum SmartFolderMatchMode {
  ALL = 'all',
  ANY = 'any',
}

export enum SmartFolderField {
  TITLE = 'title',
  TAGS = 'tags',
  URL = 'url',
  FILE_NAME = 'file_name',
  CREATED_AT = 'created_at',
  CONTENT = 'content',
}

export enum SmartFolderOperator {
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not_contains',
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  IS_EMPTY = 'is_empty',
  IS_NOT_EMPTY = 'is_not_empty',
  RECENT = 'recent',
  EARLIER_THAN = 'earlier_than',
  BEFORE = 'before',
  AFTER = 'after',
  ON = 'on',
  NOT_ON = 'not_on',
  BETWEEN = 'between',
}

export enum SmartFolderDateUnit {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  QUARTER = 'quarter',
  YEAR = 'year',
}

export interface SmartFolderConditionValue {
  amount?: number;
  unit?: SmartFolderDateUnit;
  date?: string;
  startDate?: string;
  endDate?: string;
}

export interface SmartFolderCondition {
  field?: SmartFolderField;
  operator?: SmartFolderOperator;
  value?: string | SmartFolderConditionValue;
}

@Entity('smart_folder_configs')
@Index(['namespaceId', 'rootScope'])
@Index(['namespaceId', 'ownerUserId', 'rootScope'])
export class SmartFolderConfig extends Base {
  @PrimaryColumn()
  resourceId: string;

  @Column()
  namespaceId: string;

  @Column('uuid', { nullable: true })
  ownerUserId: string | null;

  @Column('enum', { enum: SmartFolderRootScope })
  rootScope: SmartFolderRootScope;

  @Column('enum', {
    enum: SmartFolderMatchMode,
    default: SmartFolderMatchMode.ALL,
  })
  matchMode: SmartFolderMatchMode;

  @Column('jsonb', { default: [] })
  conditions: SmartFolderCondition[];
}
