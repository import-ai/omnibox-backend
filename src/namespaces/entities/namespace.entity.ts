import { Base } from 'src/common/base.entity';
import generateId from 'src/utils/generate-id';
import { Column, Entity, Index, PrimaryColumn, BeforeInsert } from 'typeorm';

@Entity('namespaces')
@Index(['name'], { unique: true, where: '"deleted_at" IS NULL' })
export class Namespace extends Base {
  @PrimaryColumn('varchar', {
    length: 6,
  })
  id: string;

  @BeforeInsert()
  generateId?() {
    this.id = generateId(6);
  }

  @Column()
  name: string;

  @Column({ name: 'max_running_tasks', type: 'int', default: 1 })
  maxRunningTasks: number;

  @Column('varchar', { name: 'root_resource_id', nullable: true })
  rootResourceId: string | null;
}
