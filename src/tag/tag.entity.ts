import { Base } from 'omnibox-backend/common/base.entity';
import generateId from 'omnibox-backend/utils/generate-id';
import { Column, Entity, BeforeInsert, PrimaryColumn } from 'typeorm';

@Entity('tags')
export class Tag extends Base {
  @PrimaryColumn()
  id: string;

  @BeforeInsert()
  generateId?() {
    this.id = generateId(6);
  }

  @Column()
  namespaceId: string;

  @Column()
  name: string;
}
