import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('resource_collaborators')
export class ResourceCollaborator extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  namespaceId: string;

  @Column()
  resourceId: string;

  @Column('uuid')
  userId: string;

  @Column({ type: 'timestamptz' })
  firstCollaboratedAt: Date;
}
