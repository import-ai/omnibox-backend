import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('local_devices')
export class LocalDevice extends Base {
  @PrimaryColumn('uuid') id: string;
  @Index() @Column('uuid') userId: string;
  @Column() name: string;
  @Column() platform: string;
  @Column() shell: string;
  @Column({ select: false }) secretHash: string;
  @Column({ default: 'ask' }) commandPolicy: 'allow' | 'deny' | 'ask';
  @Column({ default: false }) paused: boolean;
  @Column({ type: 'timestamptz', nullable: true }) lastSeenAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) revokedAt: Date | null;
}
