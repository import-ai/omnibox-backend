import { ResourcePermission } from 'src/permissions/resource-permission.enum';

export class NamespaceMemberDto {
  userId: string;
  email: string;
  username: string | null;
  role: string;
  level: ResourcePermission;
}
