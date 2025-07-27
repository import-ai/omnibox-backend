import { Base } from 'omniboxd/common/base.entity';
import { Index, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum NamespaceRole {
  OWNER = 'owner',
  MEMBER = 'member',
}

@Entity('namespace_members')
export class NamespaceMember extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  namespaceId: string;

  @Column()
  userId: string;

  @Column('enum', { enum: NamespaceRole })
  role: NamespaceRole;

  @Column()
  rootResourceId: string;
}
