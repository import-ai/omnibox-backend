import { Base } from 'omniboxd/common/base.entity';
import {
  ResourceSortBy,
  ResourceSortOrder,
} from 'omniboxd/resources/resource-sort';
import generateId from 'omniboxd/utils/generate-id';
import { BeforeInsert, Column, Entity, PrimaryColumn } from 'typeorm';

export enum ShareType {
  DOC_ONLY = 'doc_only',
  CHAT_ONLY = 'chat_only',
  ALL = 'all',
}

@Entity('shares')
export class Share extends Base {
  @PrimaryColumn()
  id: string;

  @BeforeInsert()
  generateId?() {
    this.id = generateId(10);
  }

  @Column()
  namespaceId: string;

  @Column()
  resourceId: string;

  @Column('uuid', { nullable: true })
  userId: string | null;

  @Column()
  enabled: boolean;

  @Column()
  allResources: boolean;

  @Column()
  requireLogin: boolean;

  @Column('enum', { enum: ShareType })
  shareType: ShareType;

  @Column('varchar', { nullable: true })
  password: string | null;

  @Column('timestamptz', { nullable: true })
  expiresAt: Date | null;

  @Column('varchar', { default: ResourceSortBy.UPDATED_AT })
  sortBy: ResourceSortBy;

  @Column('varchar', { default: ResourceSortOrder.DESC })
  sortOrder: ResourceSortOrder;
}
