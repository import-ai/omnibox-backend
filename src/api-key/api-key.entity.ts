import { Base } from 'omnibox-backend/common/base.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('api_keys')
export class APIKey extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 32, nullable: true })
  comment: string;

  @Column({ name: 'user_id' })
  userId: string;
}
