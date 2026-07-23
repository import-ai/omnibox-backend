import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('feature_previews')
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
    return this.userEnabled ?? this.rolloutEnabled ?? false;
  }
}
