import { Group } from 'src/groups/entities/group.entity';
import { PermissionLevel } from '../permission-level.enum';
import { User } from 'src/user/entities/user.entity';

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
  email: string;
  username: string;

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
  level: PermissionLevel;

  static new(user: User, level: PermissionLevel | null): UserPermissionDto {
    return {
      user: UserDto.fromUserEntity(user),
      level: level || PermissionLevel.NO_ACCESS,
    };
  }
}

export class GroupPermissionDto {
  group: GroupDto;
  level: PermissionLevel;

  static new(group: Group, level: PermissionLevel | null): GroupPermissionDto {
    return {
      group: GroupDto.fromGroupEntity(group),
      level: level || PermissionLevel.NO_ACCESS,
    };
  }
}

export class ListRespDto {
  globalLevel: PermissionLevel;
  users: UserPermissionDto[];
  groups: GroupPermissionDto[];
}
