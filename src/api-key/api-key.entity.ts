import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum APIKeyPermission {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
}

export enum APIKeyPermissionTarget {
  RESOURCES = 'resources',
}

export class APIKeyAttrs {
  root_resource_id: string;
  permissions: Record<APIKeyPermissionTarget, APIKeyPermission[]>;
}

@Entity('api_keys')
export class APIKey extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  namespaceId: string;

  @Column('jsonb')
  attrs: APIKeyAttrs;
}
