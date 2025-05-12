import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { PermissionDto } from './dto/permission.dto';
import { ListRespDto } from './dto/list-resp.dto';
import { plainToInstance } from 'class-transformer';
import { PermissionLevel } from './permission-level.enum';
import { UserPermission } from './entities/user-permission.entity';
import { GroupPermission } from './entities/group-permission.entity';
import { ResourcesService } from 'src/resources/resources.service';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(UserPermission)
    private readonly userPermiRepo: Repository<UserPermission>,
    @InjectRepository(GroupPermission)
    private readonly groupPermiRepo: Repository<GroupPermission>,
    private readonly dataSource: DataSource,
    private readonly resourceService: ResourcesService,
  ) {}

  async listPermissions(
    namespaceId: string,
    resourceId: string,
  ): Promise<ListRespDto> {
    const users = await this.userPermiRepo.find({
      where: { namespaceId, resourceId },
      relations: ['user'],
    });
    const groups = await this.groupPermiRepo.find({
      where: { namespaceId, resourceId },
      relations: ['group'],
    });
    const resource = await this.resourceService.get(resourceId);
    return plainToInstance(
      ListRespDto,
      {
        users,
        groups,
        globalLevel: resource.globalLevel,
      },
      { excludeExtraneousValues: true },
    );
  }

  async updateGlobalPermission(
    namespaceId: string,
    resourceId: string,
    permission: PermissionDto,
  ) {
    await this.resourceService.updateGlobalPermission(
      namespaceId,
      resourceId,
      permission.level,
    );
  }

  async getGroupPermission(
    namespaceId: string,
    resourceId: string,
    groupId: string,
  ): Promise<PermissionDto> {
    const permission = await this.groupPermiRepo.findOne({
      where: { namespaceId, resourceId, groupId },
    });
    const level = permission ? permission.level : PermissionLevel.FULL_ACCESS;
    return plainToInstance(PermissionDto, { level });
  }

  async updateGroupPermission(
    namespaceId: string,
    resourceId: string,
    groupId: string,
    permission: PermissionDto,
  ) {
    const level = permission.level;
    await this.dataSource.transaction(async (manager) => {
      const result = await manager.update(
        GroupPermission,
        { namespaceId, resourceId, groupId },
        { level },
      );
      if (result.affected === 0) {
        await manager.save(
          manager.create(GroupPermission, {
            namespaceId,
            resourceId,
            groupId,
            level,
          }),
        );
      }
    });
  }

  async getUserPermission(
    namespaceId: string,
    resourceId: string,
    userId: string,
  ): Promise<PermissionDto> {
    const permission = await this.userPermiRepo.findOne({
      where: { namespaceId, resourceId, userId },
    });
    const level = permission ? permission.level : PermissionLevel.FULL_ACCESS;
    return plainToInstance(PermissionDto, { level });
  }

  async updateUserPermission(
    namespaceId: string,
    resourceId: string,
    userId: string,
    permission: PermissionDto,
  ) {
    const level = permission.level;
    await this.dataSource.transaction(async (manager) => {
      const result = await manager.update(
        UserPermission,
        { namespaceId, resourceId, userId, deletedAt: IsNull() },
        { level },
      );
      if (result.affected === 0) {
        await manager.save(
          manager.create(UserPermission, {
            namespaceId,
            resourceId,
            userId,
            level,
          }),
        );
      }
    });
  }
}
