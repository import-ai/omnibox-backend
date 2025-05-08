import { User } from 'src/user/user.entity';
import { Base } from 'src/common/base.entity';
import {
  Column,
  Entity,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Namespace } from 'src/namespaces/entities/namespace.entity';

export enum SpaceType {
  PRIVATE = 'private',
  TEAMSPACE = 'teamspace',
}

export enum ResourceType {
  DOC = 'doc',
  LINK = 'link',
  FILE = 'file',
  FOLDER = 'folder',
}

@Entity('resources')
export class Resource extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  name: string;

  @Column({ name: 'resource_type', type: 'enum', enum: ResourceType })
  resourceType: string;

  @Column('uuid', { name: 'parent_id', nullable: true })
  parentId: string | null;

  @Column('jsonb', { nullable: true })
  tags: string[];

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ name: 'child_count', default: 0 })
  childCount: number;

  @Column('jsonb', { nullable: true })
  attrs: Record<string, any>;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Namespace)
  @JoinColumn({ name: 'namespace_id' })
  namespace: Namespace;
}
