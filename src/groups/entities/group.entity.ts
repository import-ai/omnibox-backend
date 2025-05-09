import { Base } from 'src/common/base.entity';
import { Namespace } from 'src/namespaces/entities/namespace.entity';
import generateId from 'src/utils/generate_id';
import {
  Entity,
  ManyToOne,
  JoinColumn,
  Column,
  PrimaryColumn,
  BeforeInsert,
} from 'typeorm';

@Entity('groups')
export class Group extends Base {
  @PrimaryColumn('varchar', {
    length: 6,
  })
  id: string;

  @BeforeInsert()
  generateId?() {
    this.id = generateId(6);
  }

  @Column({ name: 'namespace_id' })
  namespaceId: string;

  @Column()
  title: string;

  @ManyToOne(() => Namespace)
  @JoinColumn({ name: 'namespace_id' })
  namespace: Namespace;
}
