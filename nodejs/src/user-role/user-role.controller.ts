import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { UserRoleService } from './user-role.service';
import { UserRole } from './user-role.entity';

@Controller('api/v1/roles')
export class UserRoleController {
  constructor(private readonly userRoleService: UserRoleService) {}

  @Post()
  async create(@Body() userRole: Partial<UserRole>): Promise<UserRole> {
    return this.userRoleService.create(userRole);
  }

  @Get(':id')
  async findOne(
    @Param('user_role_id') user_role_id: string,
  ): Promise<UserRole | null> {
    return this.userRoleService.findOne(user_role_id);
  }
}
