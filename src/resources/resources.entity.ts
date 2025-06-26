import { User } from 'src/user/entities/user.entity';
import { Base } from 'src/common/base.entity';
import generateId from 'src/utils/generate-id';
import {
  Column,
  Entity,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
  BeforeInsert,
} from 'typeorm';
import { Namespace } from 'src/namespaces/entities/namespace.entity';
import { PermissionLevel } from 'src/permissions/permission-level.enum';

export enum ResourceType {
  DOC = 'doc',
  LINK = 'link',
  FILE = 'file',
  FOLDER = 'folder',
}

@Entity('resources')
export class Resource extends Base {
  @PrimaryColumn('varchar', {
    length: 16,
  })
  id: string;

  @BeforeInsert()
  generateId?() {
    this.id = generateId(16);
  }

  @Column({ nullable: true })
  name: string;

  @Column({ name: 'resource_type', type: 'enum', enum: ResourceType })
  resourceType: string;

  @Column('varchar', { name: 'parent_id', nullable: true })
  parentId: string | null;

  @Column('jsonb', { nullable: true })
  tags: string[];

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column('jsonb', { nullable: true })
  attrs: Record<string, any>;

  @Column({
    type: 'enum',
    name: 'global_level',
    enum: PermissionLevel,
    nullable: true,
  })
  globalLevel: PermissionLevel | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Namespace)
  @JoinColumn({ name: 'namespace_id' })
  namespace: Namespace;
}
