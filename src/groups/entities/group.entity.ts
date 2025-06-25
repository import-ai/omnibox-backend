import { Base } from 'src/common/base.entity';
import { Namespace } from 'src/namespaces/entities/namespace.entity';
import generateId from 'src/utils/generate-id';
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

  @Column()
  title: string;

  @ManyToOne(() => Namespace, { nullable: false })
  @JoinColumn({ name: 'namespace_id' })
  namespace: Namespace;
}
