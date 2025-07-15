import { Base } from 'src/common/base.entity';
import generateId from 'src/utils/generate-id';
import { ResourcePermission } from 'src/permissions/resource-permission.enum';
import { Column, Entity, Index, PrimaryColumn, BeforeInsert } from 'typeorm';
import { NamespaceRole } from 'src/namespaces/entities/namespace-member.entity';

@Entity('invitations')
export class Invitation extends Base {
  @PrimaryColumn()
  id: string;

  @BeforeInsert()
  generateId?() {
    this.id = generateId(6);
  }

  @Column()
  namespaceId: string;

  @Column('enum', { enum: NamespaceRole })
  namespaceRole: NamespaceRole;

  @Column('enum', { enum: ResourcePermission })
  rootPermission: ResourcePermission;

  @Column('varchar', { nullable: true })
  groupId: string | null;
}
