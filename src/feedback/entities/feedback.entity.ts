import { Base } from 'omniboxd/common/base.entity';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

export enum FeedbackType {
  BUG = 'bug',
  SUGGESTION = 'suggestion',
  FEATURE = 'feature',
  OTHER = 'other',
}

@Entity('feedback')
export class Feedback extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'enum',
    enum: FeedbackType,
  })
  type: FeedbackType;

  @Column('text')
  description: string;

  @Column('varchar', { nullable: true, name: 'image_url' })
  imageUrl: string | null;

  @Column('varchar', { nullable: true, name: 'contact_info' })
  contactInfo: string | null;

  @Column('text', { nullable: true, name: 'user_agent' })
  userAgent: string | null;

  @Column('uuid', { nullable: true, name: 'user_id' })
  userId: string | null;
}
