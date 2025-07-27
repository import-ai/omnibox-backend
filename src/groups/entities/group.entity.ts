import { Base } from 'omniboxd/common/base.entity';
import generateId from 'omniboxd/utils/generate-id';
import { Entity, Column, PrimaryColumn, BeforeInsert } from 'typeorm';

@Entity('groups')
export class Group extends Base {
  @PrimaryColumn()
  id: string;

  @BeforeInsert()
  generateId?() {
    this.id = generateId(6);
  }

  @Column()
  namespaceId: string;

  @Column()
  title: string;
}
