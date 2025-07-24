import { Base } from 'omnibox-backend/common/base.entity';
import generateId from 'omnibox-backend/utils/generate-id';
import { Column, Entity, Index, PrimaryColumn, BeforeInsert } from 'typeorm';

@Entity('namespaces')
export class Namespace extends Base {
  @PrimaryColumn()
  id: string;

  @BeforeInsert()
  generateId?() {
    this.id = generateId(6);
  }

  @Column()
  name: string;

  @Column({ default: 1 })
  maxRunningTasks: number;

  @Column('varchar', { nullable: true })
  rootResourceId: string | null;
}
