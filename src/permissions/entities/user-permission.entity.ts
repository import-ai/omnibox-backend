import { Base } from 'src/common/base.entity';
import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { PermissionLevel } from '../permission-level.enum';

@Entity('user_permissions')
@Index(['namespaceId', 'resourceId', 'userId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class UserPermission extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: PermissionLevel })
  level: PermissionLevel;

  @Column({ name: 'namespace_id' })
  namespaceId: string;

  @Column({ name: 'resource_id', nullable: false })
  resourceId: string;

  @Column({ name: 'user_id' })
  userId: string;
}
