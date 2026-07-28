import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('rss_item_contents')
@Index(['url', 'guid'], { unique: true })
export class RssItemContent extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  url: string;

  // The item's own guid, or a content hash when the feed omits one.
  @Column()
  guid: string;

  @Column('text')
  content: string;
}
