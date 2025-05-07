import { Base } from 'src/common/base.entity';
import { Namespace } from 'src/namespaces/namespaces.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Column,
} from 'typeorm';


@Entity('groups')
export class Group extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'namespace_id' })
  namespaceId: string;

  @Column()
  title: string;

  @ManyToOne(() => Namespace)
  @JoinColumn({ name: 'namespace_id' })
  namespace: Namespace;
}
