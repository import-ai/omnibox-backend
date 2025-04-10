import { ParseIntPipe } from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { UpdateUserDto } from 'src/user/dto/update-user.dto';
import {
  Get,
  Post,
  Body,
  Patch,
  Query,
  Param,
  Delete,
  Controller,
} from '@nestjs/common';

@Controller('api/user')
export class UserController {
  constructor(private userService: UserService) {}

  @Post()
  async create(@Body() account: CreateUserDto) {
    return await this.userService.create(account);
  }

  @Get()
  async findAll(
    @Query('start', ParseIntPipe) start,
    @Query('limit', ParseIntPipe) limit,
    @Query('username') username,
  ) {
    return await this.userService.findAll(start, limit, username);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.userService.find(+id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() account: UpdateUserDto) {
    return await this.userService.update(+id, account);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.userService.remove(+id);
  }
}
