import { Base } from 'src/common/base.entity';
import generateId from 'src/utils/generate-id';
import { Entity, Column, PrimaryColumn, BeforeInsert } from 'typeorm';

@Entity('groups')
export class Group extends Base {
  @PrimaryColumn('varchar', {
    length: 6,
  })
  id: string;

  @BeforeInsert()
  generateId?() {
    this.id = generateId(6);
  }

  @Column()
  title: string;

  @Column({ name: 'namespace_id' })
  namespaceId: string;
}
