import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('namespace_member_name_snapshots')
export class NamespaceMemberNameSnapshot extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  namespaceId: string;

  @Column('uuid')
  userId: string;

  @Column('text')
  label: string;
}
