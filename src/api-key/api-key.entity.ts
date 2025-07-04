import { Base } from 'src/common/base.entity';
import { User } from 'src/user/entities/user.entity';
import {
  Column,
  Entity,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('api_keys')
export class APIKey extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 32, nullable: true })
  comment: string;

  @ManyToOne(() => User, (user) => user.apiKey)
  @Column({ name: 'user_id' })
  user: User;
}
