import { Base } from 'src/common/base.entity';
import generateId from 'src/utils/generate-id';
import { Namespace } from 'src/namespaces/entities/namespace.entity';
import {
  Column,
  Entity,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
  PrimaryColumn,
} from 'typeorm';

@Entity('tag')
export class Tag extends Base {
  @PrimaryColumn('varchar', {
    length: 6,
  })
  id: string;

  @BeforeInsert()
  generateId?() {
    this.id = generateId(6);
  }

  @Column({
    type: 'varchar',
    length: 20,
  })
  name: string;

  @ManyToOne(() => Namespace)
  @JoinColumn({ name: 'namespace_id' })
  namespace: Namespace;
}
