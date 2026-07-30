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
  // (exponential backoff). Untouched by a content refresh so a re-fetch never
  // resets an item's backoff.
  @Column('int', { default: 0 })
  parseAttempts: number;

  @Column('timestamptz', { nullable: true })
  parseNextAttemptAt: Date | null;

  // The feed item's title and published date. Null when the feed omits them (or
  // for content rows stored before these columns existed).
  @Column('text', { nullable: true })
  title: string | null;

  @Column('timestamptz', { nullable: true })
  pubDate: Date | null;
}
