import { PermissionLevel } from 'src/permissions/permission-level.enum';

export class NamespaceMemberDto {
  id: number;
  userId: string;
  email: string;
  role: string;
  username: string;
  level: PermissionLevel;
}
