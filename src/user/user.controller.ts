import { UserService } from 'src/user/user.service';
import { UpdateUserDto } from 'src/user/dto/update-user.dto';
import { CreateUserOptionDto } from 'src/user/dto/create-user-option.dto';
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
    @Query('search') search: string,
  ) {
    return await this.userService.findAll(start, limit, search);
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
  async createOption(@Req() req, @Body() createOptionDto: CreateUserOptionDto) {
    const option = await this.userService.getOption(
      req.user.id,
      createOptionDto.name,
    );
    if (option && option.name) {
      return await this.userService.updateOption(
        req.user.id,
        option.name,
        createOptionDto.value,
      );
    }
    return await this.userService.createOption(req.user.id, createOptionDto);
  }

  @Get('option/:name')
  async getOption(@Req() req, @Param('name') name: string) {
    return await this.userService.getOption(req.user.id, name);
  }
}
