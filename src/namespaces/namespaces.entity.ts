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
  @PrimaryColumn()
  id: string;

  @BeforeInsert()
  generateId() {
    this.id = nanoid(10);
  }

  @Column()
  name: string;

  @Column('uuid', { array: true, nullable: true, default: [] })
  collaborators: string[];

  @Column('uuid', { array: true, default: [] })
  owner_id: string[];

  @Column({ type: 'int', default: 1 })
  max_running_tasks: number;

  @OneToOne(() => Resource, { nullable: true })
  @JoinColumn({ name: 'root_resource_id' })
  rootResource: Resource | null;

  @Column('uuid', { name: 'root_resource_id', nullable: true })
  rootResourceId: string | null;
}
