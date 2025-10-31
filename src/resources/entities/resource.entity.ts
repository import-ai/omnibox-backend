import { Base } from 'omniboxd/common/base.entity';
import generateId from 'omniboxd/utils/generate-id';
import { Column, Entity, PrimaryColumn, BeforeInsert } from 'typeorm';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';

export enum ResourceType {
  DOC = 'doc',
  LINK = 'link',
  FILE = 'file',
  FOLDER = 'folder',
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
  name: string;

  @Column('enum', { enum: ResourceType })
  resourceType: ResourceType;

  @Column()
  content: string;

  @Column('jsonb')
  attrs: Record<string, any>;

  @Column('uuid', { nullable: true })
  fileId: string | null;

  @Column('text', { array: true, default: '{}' })
  tagIds: string[];

  @Column('enum', { enum: ResourcePermission, nullable: true })
  globalPermission: ResourcePermission | null;
}
