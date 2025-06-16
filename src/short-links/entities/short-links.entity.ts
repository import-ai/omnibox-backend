import { Base } from "src/common/base.entity";
import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity('short_links')
@Index(['sourceUri'], { unique: true })
export class ShortLink extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "source_uri", nullable: false })
  sourceUri: string

  @Column({ name: "target_uri", nullable: false })
  targetUri: string;
}
