import { UserRole } from 'src/user-role/user-role.entity';
import { UserRoleService } from 'src/user-role/user-role.service';
import { Controller, Get, Post, Body, Param } from '@nestjs/common';

@Controller('api/v1/roles')
export class UserRoleController {
  constructor(private readonly userRoleService: UserRoleService) {}

  @Post()
  async create(@Body() userRole: Partial<UserRole>): Promise<UserRole> {
    return await this.userRoleService.create(userRole);
  }

  @Get(':id')
  async findOne(
    @Param('user_role_id') user_role_id: string,
  ): Promise<UserRole | null> {
    return await this.userRoleService.findOne(user_role_id);
  }
}
