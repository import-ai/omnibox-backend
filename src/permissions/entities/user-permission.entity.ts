import { Base } from 'omniboxd/common/base.entity';
import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { ResourcePermission } from '../resource-permission.enum';

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

  @Column('enum', { enum: ResourcePermission })
  permission: ResourcePermission;
}
