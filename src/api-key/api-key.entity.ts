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
  CHAT = 'chat',
  TAGS = 'tags',
  SEARCH = 'search',
}

export type APIKeyPermission = {
  target: APIKeyPermissionTarget;
  permissions: APIKeyPermissionType[];
};

export type APIKeyAttrs = {
  related_app_id?: string;
  root_resource_id: string;
  permissions: APIKeyPermission[];
};

export const API_KEY_PERMISSION_MATRIX: Record<
  APIKeyPermissionTarget,
  readonly APIKeyPermissionType[]
> = {
  [APIKeyPermissionTarget.RESOURCES]: [
    APIKeyPermissionType.CREATE,
    APIKeyPermissionType.READ,
    APIKeyPermissionType.UPDATE,
    APIKeyPermissionType.DELETE,
  ],
  [APIKeyPermissionTarget.CHAT]: [APIKeyPermissionType.CREATE],
  [APIKeyPermissionTarget.TAGS]: [
    APIKeyPermissionType.CREATE,
    APIKeyPermissionType.READ,
  ],
  [APIKeyPermissionTarget.SEARCH]: [APIKeyPermissionType.READ],
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
