import { UserService } from 'src/user/user.service';
import { UpdateUserDto } from 'src/user/dto/update-user.dto';
import { CreateUserOptionDto } from 'src/user/dto/create-user-option.dto';
import { UpdateUserOptionDto } from 'src/user/dto/update-user-option.dto';
import {
  Req,
  Get,
  Body,
  Patch,
  Query,
  Param,
  Delete,
  Post,
  Controller,
  ParseIntPipe,
} from '@nestjs/common';

@Controller('api/v1/user')
export class UserController {
  constructor(private userService: UserService) {}

  @Get()
  async findAll(
    @Query('start', ParseIntPipe) start: number,
    @Query('limit', ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return await this.userService.findAll(start, limit, search);
  }

  @Get('users-by-ids')
  async usersByIds(@Query('id') id: string) {
    if (!id) {
      return [];
    }
    const ids = id.split(',');
    if (ids.length <= 0) {
      return [];
    }
    return await this.userService.usersByIds(ids);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return await this.userService.find(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() account: UpdateUserDto) {
    return await this.userService.update(id, account);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.userService.remove(id);
  }

  @Post('option')
  createOption(@Req() req, @Body() createOptionDto: CreateUserOptionDto) {
    return this.userService.createOption(req.user.id, createOptionDto);
  }

  @Get('option')
  getAllOption(@Req() req) {
    return this.userService.getAllOption(req.user.id);
  }

  @Patch('option/:name')
  updateOption(
    @Req() req,
    @Param('name') name: string,
    @Body() updateOptionDto: UpdateUserOptionDto,
  ) {
    return this.userService.updateOption(
      req.user.id,
      name,
      updateOptionDto.value,
    );
  }

  @Delete('option/:name')
  removeOption(@Req() req, @Param('name') name: string) {
    return this.userService.removeOption(req.user.id, name);
  }
}
