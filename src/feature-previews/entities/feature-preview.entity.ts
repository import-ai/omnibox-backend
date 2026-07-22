import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('feature_previews')
@Index(['userId', 'feature'], {
  unique: true,
  where: '"deletedAt" IS NULL',
})
export class FeaturePreview extends Base {
  @PrimaryGeneratedColumn()
  id: string;

  @Column('uuid')
  userId: string;

  @Column()
  feature: string;

  @Column({ type: 'boolean', nullable: true })
  userEnabled: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  rolloutEnabled: boolean | null;

  get enabled(): boolean {
    return this.userEnabled || this.rolloutEnabled || false;
  }
}
