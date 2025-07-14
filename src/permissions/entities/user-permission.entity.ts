import { Base } from 'src/common/base.entity';
import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { PermissionLevel } from '../permission-level.enum';

@Entity('user_permissions')
export class UserPermission extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  namespaceId: string;

  @Column()
  userId: string;

  @Column()
  resourceId: string;

  @Column('enum', { enum: PermissionLevel })
  level: PermissionLevel;
}
