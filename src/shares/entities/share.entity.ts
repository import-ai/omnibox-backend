import { Base } from 'omniboxd/common/base.entity';
import generateId from 'omniboxd/utils/generate-id';
import { BeforeInsert, Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('shares')
export class Share extends Base {
  @PrimaryColumn()
  id: string;

  @BeforeInsert()
  generateId?() {
    this.id = generateId(16);
  }

  @Column()
  namespaceId: string;

  @Column()
  resourceId: string;

  @Column()
  requireAuthentication: boolean;

  @Column('varchar', { nullable: true })
  password: string | null;

  @Column('timestamptz', { nullable: true })
  expiresAt: Date | null;
}
