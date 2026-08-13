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
export const READ_ONLY_RESOURCE_TYPES: ResourceType[] = [ResourceType.RSS_ITEM];

export function isReadOnlyResourceType(resourceType: ResourceType): boolean {
  return READ_ONLY_RESOURCE_TYPES.includes(resourceType);
}

// The subscription (RSS) subtree: a folder and the items a poller files under
// it. Smart folders and the search filter drop the whole subtree — an rss
// folder renders an expandable node that errors when opened, and a busy feed
// would otherwise swamp every match list. Containment (assertContainment)
// guarantees an rss folder's only children are rss items, so testing the type
// covers the descendants too.
export function isSubscriptionResourceType(
  resourceType: ResourceType,
): boolean {
  return (
    resourceType === ResourceType.RSS_FOLDER ||
    resourceType === ResourceType.RSS_ITEM
  );
}

// Types that carry side-car state their own service owns (rss folders need
// rss_links plus feed validation and a quota check, smart folders need a
// config row), so the generic create/duplicate endpoints must refuse them:
// a row created there would be a permanently inert folder that also escapes
// its tier limit.
export const SERVICE_OWNED_RESOURCE_TYPES: ResourceType[] = [
  ResourceType.RSS_FOLDER,
  ResourceType.SMART_FOLDER,
];

export function isServiceOwnedResourceType(
  resourceType: ResourceType,
): boolean {
  return SERVICE_OWNED_RESOURCE_TYPES.includes(resourceType);
}

// Types that hold user content. Folders of every kind are containers and rss
// items belong to their subscription, so listings of "what the user has"
// (recent, tag lookups, staleness) select these and nothing else.
export const CONTENT_RESOURCE_TYPES: ResourceType[] = [
  ResourceType.DOC,
  ResourceType.LINK,
  ResourceType.FILE,
];

export function isContentResourceType(resourceType: ResourceType): boolean {
  return CONTENT_RESOURCE_TYPES.includes(resourceType);
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
