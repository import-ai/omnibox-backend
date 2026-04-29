import generateId from 'omniboxd/utils/generate-id';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
} from 'typeorm';

@Entity('resource_revisions')
export class ResourceRevision {
  @PrimaryColumn()
  id: string;

  @BeforeInsert()
  generateId?() {
    this.id = generateId(16);
  }

  @Column()
  namespaceId: string;

  @Column()
  resourceId: string;

  @Column('uuid', { nullable: true })
  updatedByUserId: string | null;

  @Column()
  name: string;

  @Column('text')
  content: string;

  @Column('text', { array: true, default: '{}' })
  tagIds: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
