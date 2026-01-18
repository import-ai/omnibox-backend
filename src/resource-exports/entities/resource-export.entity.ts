import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, PrimaryColumn, BeforeInsert } from 'typeorm';
import generateId from 'omniboxd/utils/generate-id';

export enum ExportStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

@Entity('resource_exports')
export class ResourceExport extends Base {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @BeforeInsert()
  generateId() {
    this.id = generateId(16);
  }

  @Column({ name: 'namespace_id', type: 'varchar' })
  namespaceId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'resource_id', type: 'varchar' })
  resourceId: string;

  @Column({
    type: 'enum',
    enum: ExportStatus,
    default: ExportStatus.PENDING,
  })
  status: ExportStatus;

  @Column({ name: 's3_key', type: 'varchar', nullable: true })
  s3Key: string | null;

  @Column({ name: 'error_message', type: 'varchar', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'total_resources', default: 0 })
  totalResources: number;

  @Column({ name: 'processed_resources', default: 0 })
  processedResources: number;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;
}
