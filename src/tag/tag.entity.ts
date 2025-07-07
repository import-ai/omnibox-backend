import { Base } from 'src/common/base.entity';
import generateId from 'src/utils/generate-id';
import { Column, Entity, BeforeInsert, PrimaryColumn } from 'typeorm';

@Entity('tags')
export class Tag extends Base {
  @PrimaryColumn('varchar', {
    length: 6,
  })
  id: string;

  @BeforeInsert()
  generateId?() {
    this.id = generateId(6);
  }

  @Column({
    type: 'varchar',
    length: 20,
    nullable: false,
  })
  name: string;

  @Column({ name: 'namespace_id', nullable: false })
  namespaceId: string;
}
