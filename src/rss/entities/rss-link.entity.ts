import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('rss_links')
@Index(['resourceId', 'index'])
export class RssLink extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  namespaceId: string;

  @Column()
  resourceId: string;

  @Column('int')
  index: number;

  @Column('text')
  url: string;

  @Column({ default: '' })
  name: string;
}
