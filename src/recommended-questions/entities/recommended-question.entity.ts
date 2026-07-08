import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export interface RecommendedQuestionPayload {
  question: string;
  intent: string;
  reason: string;
}

export interface RecommendedQuestionItemMeta {
  intent: string;
  reason: string;
}

@Entity('recommended_questions')
@Index(['namespaceId', 'userId'], {
  unique: true,
  where: '"deletedAt" IS NULL',
})
export class RecommendedQuestion extends Base {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  namespaceId: string;

  @Column('uuid')
  userId: string;

  @Column('timestamptz')
  scannedAt: Date;

  @Column('timestamptz', { nullable: true })
  generatedAt: Date | null;
}

@Entity('recommended_question_items')
@Index(['recommendedQuestionId'])
export class RecommendedQuestionItem extends Base {
  @PrimaryGeneratedColumn()
  id: string;

  @Column('bigint')
  recommendedQuestionId: string;

  @Column('text')
  question: string;

  @Column('jsonb', { nullable: true })
  meta: RecommendedQuestionItemMeta | null;
}
