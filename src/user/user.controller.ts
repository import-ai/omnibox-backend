import { UserService } from 'src/user/user.service';
import { UpdateUserDto } from 'src/user/dto/update-user.dto';
import {
  Get,
  Body,
  Patch,
  Query,
  Param,
  Delete,
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

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.userService.find(id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() account: UpdateUserDto,
  ) {
    return await this.userService.update(id, account);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return await this.userService.remove(id);
  }
}
