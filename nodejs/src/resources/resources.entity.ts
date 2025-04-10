import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { User } from 'src/user/user.entity';

@Entity('resources')
export class Resource {
  @PrimaryGeneratedColumn('uuid')
  resourceId: string;

  @Column({ nullable: false })
  name: string;

  @Column({ type: 'enum', enum: ['doc', 'link', 'file', 'folder'], nullable: false })
  resourceType: string;

  @Column({ nullable: false })
  namespaceId: string;

  @Column({ type: 'enum', enum: ['private', 'teamspace'], nullable: false })
  spaceType: string;

  @Column({ nullable: true })
  parentId: string;

  @Column({ type: 'simple-array', nullable: true })
  tags: string[];

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ default: 0 })
  childCount: number;

  @Column({ type: 'json', nullable: true })
  attrs: Record<string, any>;

  @ManyToOne(() => User)
  user: User;

  @Column({ nullable: true })
  userId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
