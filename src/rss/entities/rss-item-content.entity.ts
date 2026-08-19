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

  @Column('text', { nullable: true })
  parsedContent: string | null;

  // Wizard parse retry state, used only while parsed_content is still null: how
  // many parse attempts have failed, and the earliest time to try again
  // (exponential backoff up to a maximum interval). Retries never give up, and
  // nothing resets this state: the row is written once, so a refetch leaves it
  // alone however the feed has since rewritten the item.
  @Column('int', { default: 0 })
  parseAttempts: number;

  @Column('timestamptz', { nullable: true })
  parseNextAttemptAt: Date | null;

  // The feed item's title and published date, frozen with the rest of the row on
  // first sight. Null when the feed omits them (or for content rows stored
  // before these columns existed).
  @Column('text', { nullable: true })
  title: string | null;

  @Column('timestamptz', { nullable: true })
  pubDate: Date | null;
}
