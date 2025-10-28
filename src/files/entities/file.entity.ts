import { Base } from 'omniboxd/common/base.entity';
import { Column, PrimaryGeneratedColumn } from 'typeorm';

export class File extends Base {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  namespaceId: string;

  @Column()
  userId: string;
}
