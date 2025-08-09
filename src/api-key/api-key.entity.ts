import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum APIKeyPermissionType {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
}

export enum APIKeyPermissionTarget {
  RESOURCES = 'resources',
}

export type APIKeyPermission = {
  target: APIKeyPermissionTarget;
  permissions: APIKeyPermissionType[];
};

export type APIKeyAttrs = {
  root_resource_id: string;
  permissions: APIKeyPermission[];
};

@Entity('api_keys')
export class APIKey extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, nullable: false })
  value: string;

  @Column()
  userId: string;

  @Column()
  namespaceId: string;

  @Column('jsonb')
  attrs: APIKeyAttrs;
}
