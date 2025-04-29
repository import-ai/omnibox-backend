import { Base } from 'src/common/base.entity';
import { Column, Entity, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('namespaces')
@Index('uniq_namespace_name', ['name'], { unique: true, where: '"deleted_at" IS NULL' })
export class Namespace extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column('uuid', { array: true, nullable: true, default: [] })
  collaborators: string[];

  @Column('uuid', { array: true, default: [] })
  owner_id: string[];

  @Column({ type: 'int', default: 1 })
  max_running_tasks: number;
}
