import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Relates a single rss_links row to a single rss_item_contents row. Contents are
// deduped globally per feed url, so this table records which link each content
// belongs to (one row per link/content pair). Unique on (linkId, contentId) so a
// link is related to a content at most once.
@Entity('rss_items')
@Index(['linkId', 'contentId'], { unique: true })
export class RssItem extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  linkId: string;

  @Column('uuid')
  contentId: string;

  @Column('text')
  title: string;
}
