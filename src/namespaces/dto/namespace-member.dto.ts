import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';

export class NamespaceMemberDto {
  userId: string;
  email: string | null;
  username: string | null;
  role: string;
  permission: ResourcePermission;
}
