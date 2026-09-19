import { Base } from 'omniboxd/common/base.entity';
import { User } from 'omniboxd/user/entities/user.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('resource_revisions')
@Index('idx_resource_revisions_resource_created', [
  'namespaceId',
  'resourceId',
  'createdAt',
])
export class ResourceRevision extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  namespaceId: string;

  @Column()
  resourceId: string;

  @Column('uuid', { nullable: true })
  authorId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'author_id' })
  author?: User | null;

  @Column()
  name: string;

  @Column('text')
  content: string;

  @Column('varchar', { length: 64 })
  contentHash: string;
}
