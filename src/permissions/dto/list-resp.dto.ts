import { Group } from 'omnibox-backend/groups/entities/group.entity';
import { ResourcePermission } from '../resource-permission.enum';
import { User } from 'omnibox-backend/user/entities/user.entity';

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
  level: ResourcePermission;

  static new(user: User, level: ResourcePermission | null): UserPermissionDto {
    return {
      user: UserDto.fromUserEntity(user),
      level: level || ResourcePermission.NO_ACCESS,
    };
  }
}

export class GroupPermissionDto {
  group: GroupDto;
  level: ResourcePermission;

  static new(
    group: Group,
    level: ResourcePermission | null,
  ): GroupPermissionDto {
    return {
      group: GroupDto.fromGroupEntity(group),
      level: level || ResourcePermission.NO_ACCESS,
    };
  }
}

export class ListRespDto {
  globalPermission: ResourcePermission;
  users: UserPermissionDto[];
  groups: GroupPermissionDto[];
}
