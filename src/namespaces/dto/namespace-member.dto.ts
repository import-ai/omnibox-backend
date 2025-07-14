import { PermissionLevel } from 'src/permissions/permission-level.enum';

export class NamespaceMemberDto {
  userId: string;
  email: string;
  username: string | null;
  role: string;
  level: PermissionLevel;
}
