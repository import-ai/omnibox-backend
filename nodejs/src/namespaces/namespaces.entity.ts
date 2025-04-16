import { Base } from 'src/common/base.entity';
import { User } from 'src/user/user.entity';
import { Resource } from 'src/resources/resources.entity';
import {
  Column,
  Entity,
  OneToOne,
  OneToMany,
  JoinColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('namespaces')
export class Namespace extends Base {
  @PrimaryGeneratedColumn()
  namespace_id: string;

  @Column({ length: 32, unique: true })
  name: string;

  @Column('jsonb', { nullable: true })
  collaborators: string[];

  @OneToMany(() => Resource, (resource) => resource.resource_id)
  @JoinColumn({ name: 'resource_id' })
  resource: Resource;

  @OneToOne(() => User, (user) => user.user_id)
  @JoinColumn({ name: 'owner_id' })
  User: User;
}
