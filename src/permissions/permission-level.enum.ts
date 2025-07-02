export enum PermissionLevel {
  NO_ACCESS = 'no_access',
  CAN_VIEW = 'can_view',
  CAN_COMMENT = 'can_comment',
  CAN_EDIT = 'can_edit',
  FULL_ACCESS = 'full_access',
}

const order = [
  PermissionLevel.NO_ACCESS,
  PermissionLevel.CAN_VIEW,
  PermissionLevel.CAN_COMMENT,
  PermissionLevel.CAN_EDIT,
  PermissionLevel.FULL_ACCESS,
];

export function comparePermissionLevel(
  a: PermissionLevel,
  b: PermissionLevel,
): number {
  return order.indexOf(a) - order.indexOf(b);
}

export function maxPermission(
  a: PermissionLevel | null,
  b: PermissionLevel | null,
): PermissionLevel | null {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  return comparePermissionLevel(a, b) > 0 ? a : b;
}

export function maxPermissions(
  permissions: Array<PermissionLevel | null>,
): PermissionLevel | null {
  let permission: PermissionLevel | null = null;
  for (const p of permissions) {
    permission = maxPermission(permission, p);
  }
  return permission;
}
