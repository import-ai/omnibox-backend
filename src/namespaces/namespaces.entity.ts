import { Base } from 'src/common/base.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('namespaces')
export class Namespace extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 32, unique: true })
  name: string;

  @Column('int', { array: true, nullable: true, default: [] })
  collaborators: number[];

  @Column('int', { array: true, default: [] })
  owner_id: number[];
}
