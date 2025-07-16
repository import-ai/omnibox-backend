export enum ResourcePermission {
  NO_ACCESS = 'no_access',
  CAN_VIEW = 'can_view',
  CAN_COMMENT = 'can_comment',
  CAN_EDIT = 'can_edit',
  FULL_ACCESS = 'full_access',
}

const order = [
  ResourcePermission.NO_ACCESS,
  ResourcePermission.CAN_VIEW,
  ResourcePermission.CAN_COMMENT,
  ResourcePermission.CAN_EDIT,
  ResourcePermission.FULL_ACCESS,
];

export function comparePermission(
  a: ResourcePermission,
  b: ResourcePermission,
): number {
  return order.indexOf(a) - order.indexOf(b);
}

export function maxPermission(
  a: ResourcePermission | null,
  b: ResourcePermission | null,
): ResourcePermission | null {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  return comparePermission(a, b) > 0 ? a : b;
}

export function maxPermissions(
  permissions: Array<ResourcePermission | null>,
): ResourcePermission | null {
  let permission: ResourcePermission | null = null;
  for (const p of permissions) {
    permission = maxPermission(permission, p);
  }
  return permission;
}
