import { Base } from 'src/common/base.entity';
import { Namespace } from 'src/namespaces/entities/namespace.entity';
import { Resource } from 'src/resources/resources.entity';
import { User } from 'src/user/user.entity';
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
@Index(['namespaceId', 'resourceId', 'userId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class UserPermission extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'namespace_id' })
  namespaceId: string;

  @Column({ name: 'resource_id' })
  resourceId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'enum', enum: PermissionLevel })
  level: PermissionLevel;

  @ManyToOne(() => Namespace)
  @JoinColumn({ name: 'namespace_id' })
  namespace?: Namespace;

  @ManyToOne(() => Resource)
  @JoinColumn({ name: 'resource_id' })
  resource?: Resource;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user?: User;
}
