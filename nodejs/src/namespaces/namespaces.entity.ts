import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

@Entity('namespaces')
export class Namespace {
  @PrimaryGeneratedColumn('uuid')
  namespaceId: string;

  @Column({ unique: true, nullable: false })
  name: string;

  @Column({ nullable: false })
  ownerId: string;

  @Column({ type: 'simple-array', nullable: true })
  collaborators: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
