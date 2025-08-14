import { Group } from 'omniboxd/groups/entities/group.entity';
import { ResourcePermission } from '../resource-permission.enum';
import { User } from 'omniboxd/user/entities/user.entity';

export class GroupDto {
  id: string;
  title: string;

  static fromGroupEntity(group: Group): GroupDto {
    return {
      id: group.id,
      title: group.title,
    };
  }
}

export class UserDto {
  id: string;
  email: string | null;
  username: string | null;

  static fromUserEntity(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
    };
  }
}

export class UserPermissionDto {
  user: UserDto;
  permission: ResourcePermission;

  static new(
    user: User,
    permission: ResourcePermission | null,
  ): UserPermissionDto {
    return {
      user: UserDto.fromUserEntity(user),
      permission: permission || ResourcePermission.NO_ACCESS,
    };
  }
}

export class GroupPermissionDto {
  group: GroupDto;
  permission: ResourcePermission;

  static new(
    group: Group,
    permission: ResourcePermission | null,
  ): GroupPermissionDto {
    return {
      group: GroupDto.fromGroupEntity(group),
      permission: permission || ResourcePermission.NO_ACCESS,
    };
  }
}

export class ListRespDto {
  globalPermission: ResourcePermission;
  users: UserPermissionDto[];
  groups: GroupPermissionDto[];
}
