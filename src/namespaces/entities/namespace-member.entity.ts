import { Base } from 'src/common/base.entity';
import { Index, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum NamespaceRole {
  OWNER = 'owner',
  MEMBER = 'member',
}

@Entity('namespace_members')
@Index(['userId', 'namespaceId'], { unique: true, where: 'deleted_at IS NULL' })
export class NamespaceMember extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: NamespaceRole, default: NamespaceRole.OWNER })
  role: NamespaceRole;

  @Column({ name: 'namespace_id' })
  namespaceId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'root_resource_id' })
  rootResourceId: string;
}
