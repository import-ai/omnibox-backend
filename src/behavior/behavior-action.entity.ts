import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, PrimaryColumn } from 'typeorm';
@Entity('behavior_actions')
export class BehaviorAction extends Base {
  @PrimaryColumn('uuid') id: string;
  @Column('uuid') userId: string;
  @Column('varchar') actionType: string;
  @Column('timestamptz') startedAt: Date;
  @Column('varchar') originPlatform: string;
  @Column('varchar', { nullable: true }) resourceId: string | null;
  @Column('varchar', { nullable: true }) fileId: string | null;
  @Column('varchar', { default: 'pending' }) status: string;
  @Column('timestamptz', { nullable: true }) resultAt: Date | null;
  @Column('timestamptz', { nullable: true }) emittedAt: Date | null;
}
