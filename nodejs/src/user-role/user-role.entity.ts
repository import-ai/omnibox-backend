import { Base } from 'src/common/base.entity';
import { User } from 'src/user/user.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity('user_roles')
export class UserRole extends Base {
  @PrimaryGeneratedColumn()
  user_role_id: string;

  @Column({ length: 22 })
  target_id: string;

  @Column({ type: 'enum', enum: ['owner', 'admin', 'editor', 'viewer'] })
  role: string;

  @ManyToOne(() => User, (user) => user.user_id)
  user: User[];
}
