import { Base } from 'src/common/base.entity';
import { Namespace } from 'src/namespaces/namespaces.entity';
import { Resource } from 'src/resources/resources.entity';
import { User } from 'src/user/user.entity';
import { Entity, PrimaryGeneratedColumn, Index, ManyToOne, JoinColumn } from 'typeorm';

@Entity('namespace_members')
@Index(['user', 'namespace'], { unique: true, where: 'deleted_at IS NULL' })
export class NamespaceMember extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Namespace)
  @JoinColumn({ name: 'namespace_id' })
  namespace: Namespace;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Resource)
  @JoinColumn({ name: 'root_resource_id' })
  rootResource: Resource;
}
