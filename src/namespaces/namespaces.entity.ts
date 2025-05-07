import { nanoid } from 'nanoid';
import { Base } from 'src/common/base.entity';
import { Resource } from 'src/resources/resources.entity';
import {
  Column,
  Entity,
  Index,
  OneToOne,
  JoinColumn,
  PrimaryColumn,
  BeforeInsert,
} from 'typeorm';

@Entity('namespaces')
@Index(['name'], { unique: true, where: '"deleted_at" IS NULL' })
export class Namespace extends Base {
  @PrimaryColumn('varchar', {
    length: 12,
    unique: true,
  })
  id: string;

  @BeforeInsert()
  generateId?() {
    this.id = nanoid(12);
  }

  @Column()
  name: string;

  @Column('varchar', { array: true, nullable: true, default: [] })
  collaborators: string[];

  @Column('varchar', { array: true, default: [] })
  owner_id: string[];

  @Column({ type: 'int', default: 1 })
  max_running_tasks: number;

  @OneToOne(() => Resource, { nullable: true })
  @JoinColumn({ name: 'root_resource_id' })
  rootResource: Resource | null;

  @Column('varchar', { name: 'root_resource_id', nullable: true })
  rootResourceId: string | null;
}
