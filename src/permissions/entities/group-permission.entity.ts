import { Base } from 'src/common/base.entity';
import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { PermissionLevel } from '../permission-level.enum';

@Entity('group_permissions')
export class GroupPermission extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  namespaceId: string;

  @Column()
  groupId: string;

  @Column()
  resourceId: string;

  @Column('enum', { enum: PermissionLevel })
  level: PermissionLevel;
}
