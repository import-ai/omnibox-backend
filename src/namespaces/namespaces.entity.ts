import { Base } from 'src/common/base.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('namespaces')
export class Namespace extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 32, unique: true })
  name: string;

  @Column('int', { array: true, nullable: true, default: [] })
  collaborators: string[];

  @Column('int', { array: true, default: [] })
  owner_id: string[];

  @Column({ type: 'int', default: 1 })
  max_running_tasks: number;
}
