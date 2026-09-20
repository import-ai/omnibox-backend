import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('namespace_member_notes')
export class NamespaceMemberNote extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  namespaceId: string;

  @Column('uuid')
  authorUserId: string;

  @Column('uuid')
  targetUserId: string;

  @Column('varchar', { length: 128 })
  note: string;
}
