import { Base } from 'omniboxd/common/base.entity';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import generateId from 'omniboxd/utils/generate-id';
import { BeforeInsert, Column, Entity, PrimaryColumn } from 'typeorm';

export enum ResourceType {
  DOC = 'doc',
  LINK = 'link',
  FILE = 'file',
  FOLDER = 'folder',
  SMART_FOLDER = 'smart_folder',
  RSS_FOLDER = 'rss_folder',
  // A single polled feed item. Always a child of an RSS_FOLDER, written only by
  // the poller and read-only to users.
  RSS_ITEM = 'rss_item',
}

// Resources whose content is owned by the product (written by a background
// job), not by the user: every user-facing mutation is rejected and clients
// surface them as read-only.
export function isReadOnlyResourceType(resourceType: ResourceType): boolean {
  return resourceType === ResourceType.RSS_ITEM;
}

@Entity('resources')
export class Resource extends Base {
  @PrimaryColumn()
  id: string;

  @BeforeInsert()
  generateId?() {
    this.id = generateId(16);
  }

  @Column()
  namespaceId: string;

  @Column('uuid', { nullable: true })
  userId: string | null;

  @Column('varchar', { nullable: true })
  parentId: string | null;

  @Column()
  name: string; // "" by default

  @Column('enum', { enum: ResourceType })
  resourceType: ResourceType;

  @Column()
  content: string;

  @Column('bigint')
  contentSize: string;

  @Column('jsonb')
  attrs: Record<string, any>;

  @Column('uuid', { nullable: true })
  fileId: string | null;

  @Column('text', { array: true, default: '{}' })
  tagIds: string[];

  @Column('enum', { enum: ResourcePermission, nullable: true })
  globalPermission: ResourcePermission | null;

  @Column('timestamptz', { nullable: true })
  permanentDeletedAt: Date | null;

  @Column('bigint', { nullable: true })
  manualSortIndex: string | null;

  @Column('timestamptz', { nullable: true })
  manualSortUnspecifiedAt: Date | null;

  @Column('timestamptz', { nullable: true })
  manualSortInitializedAt: Date | null;
}
