import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum StorageType {
  CONTENT = 'content',
  ATTACHMENT = 'attachment',
  UPLOAD = 'upload',
}

@Entity('storage_usages')
@Index(['namespaceId', 'userId', 'storageType'], {
  unique: true,
  where: '"deletedAt" IS NULL',
})
export class StorageUsage extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  namespaceId: string;

  @Column('uuid')
  userId: string;

  @Column('enum', { enum: StorageType })
  storageType: StorageType;

  @Column()
  amount: number;
}
