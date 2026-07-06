import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export interface RecommendedQuestionItem {
  question: string;
  intent: string;
  reason: string;
}

@Entity('recommended_questions')
@Index(['namespaceId', 'userId'], {
  unique: true,
  where: '"deletedAt" IS NULL',
})
export class RecommendedQuestions extends Base {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  namespaceId: string;

  @Column('uuid')
  userId: string;

  @Column('timestamptz', { nullable: true })
  scannedAt: Date | null;

  @Column('timestamptz', { nullable: true })
  generatedAt: Date | null;

  @Column('jsonb', { nullable: true })
  questions: RecommendedQuestionItem[] | null;
}
