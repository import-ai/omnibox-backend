import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum NamespaceRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
}

export const ROLE_LEVEL: Record<NamespaceRole, number> = {
  [NamespaceRole.OWNER]: 0,
  [NamespaceRole.ADMIN]: 1,
  [NamespaceRole.MEMBER]: 2,
};

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
