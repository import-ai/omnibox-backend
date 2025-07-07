import { Base } from 'src/common/base.entity';
import generateId from 'src/utils/generate-id';
import { PermissionLevel } from 'src/permissions/permission-level.enum';
import { Column, Entity, Index, PrimaryColumn, BeforeInsert } from 'typeorm';
import { NamespaceRole } from 'src/namespaces/entities/namespace-member.entity';

@Entity('invitations')
@Index(['namespaceId'], {
  unique: true,
  where: 'deleted_at IS NULL AND group_id IS NULL',
})
@Index(['namespaceId', 'groupId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class Invitation extends Base {
  @PrimaryColumn()
  id: string;

  @BeforeInsert()
  generateId?() {
    this.id = generateId(6);
  }

  @Column({ name: 'namespace_id' })
  namespaceId: string;

  @Column({ type: 'enum', enum: NamespaceRole, nullable: false })
  namespaceRole: NamespaceRole;

  @Column({ type: 'enum', enum: PermissionLevel, nullable: false })
  rootPermissionLevel: PermissionLevel;

  @Column({ name: 'group_id' })
  groupId: string;
}
