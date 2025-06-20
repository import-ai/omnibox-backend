import { Base } from 'src/common/base.entity';
import { Group } from 'src/groups/entities/group.entity';
import { NamespaceRole } from 'src/namespaces/entities/namespace-member.entity';
import { Namespace } from 'src/namespaces/entities/namespace.entity';
import { PermissionLevel } from 'src/permissions/permission-level.enum';
import generateId from 'src/utils/generate_id';
import {
  BeforeInsert,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';

@Entity('invitations')
@Index(['namespace'], {
  unique: true,
  where: 'deleted_at IS NULL AND group_id IS NULL',
})
@Index(['namespace', 'group'], { unique: true, where: 'deleted_at IS NULL' })
export class Invitation extends Base {
  @PrimaryColumn()
  id: string;

  @BeforeInsert()
  generateId?() {
    this.id = generateId(6);
  }

  @ManyToOne(() => Namespace, { nullable: false })
  @JoinColumn({ name: 'namespace_id' })
  namespace: Namespace;

  @Column({ type: 'enum', enum: NamespaceRole, nullable: false })
  namespaceRole: NamespaceRole;

  @Column({ type: 'enum', enum: PermissionLevel, nullable: false })
  rootPermissionLevel: PermissionLevel;

  @ManyToOne(() => Group, { nullable: true })
  @JoinColumn({ name: 'group_id' })
  group: Group | null;
}
