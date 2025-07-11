import { PermissionLevel } from 'src/permissions/permission-level.enum';

export class NamespaceMemberDto {
  userId: string;
  email: string;
  username?: string;
  role: string;
  level: PermissionLevel;
}
