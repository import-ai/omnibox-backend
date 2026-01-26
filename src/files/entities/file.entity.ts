import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('files')
export class File extends Base {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  namespaceId: string;

  @Column()
  userId: string;

  @Column()
  name: string;

  @Column()
  mimetype: string;

  @Column()
  size: number;
}
