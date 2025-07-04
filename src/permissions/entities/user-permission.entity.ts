import { Base } from 'src/common/base.entity';
import { Namespace } from 'src/namespaces/entities/namespace.entity';
import { Resource } from 'src/resources/resources.entity';
import { User } from 'src/user/entities/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Column,
  Index,
} from 'typeorm';
import { PermissionLevel } from '../permission-level.enum';

@Entity('user_permissions')
@Index(['namespace', 'resource', 'user'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class UserPermission extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: PermissionLevel })
  level: PermissionLevel;

  @ManyToOne(() => Namespace, { nullable: false })
  @JoinColumn({ name: 'namespace_id' })
  namespace?: Namespace;

  @ManyToOne(() => Resource, { nullable: false })
  @JoinColumn({ name: 'resource_id' })
  resource?: Resource;

  @Column({ name: 'resource_id', nullable: false })
  resourceId: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: User;
}
