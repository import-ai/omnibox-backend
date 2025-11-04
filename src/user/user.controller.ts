import { UserService } from 'omniboxd/user/user.service';
import { UpdateUserDto } from 'omniboxd/user/dto/update-user.dto';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { CreateUserOptionDto } from 'omniboxd/user/dto/create-user-option.dto';
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

  @Get('me')
  current(@Req() req) {
    return req.user;
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return await this.userService.find(id);
  }

  @Post('email/validate')
  async validateEmail(@UserId() userId: string, @Body('email') email: string) {
    return await this.userService.validateEmail(userId, email);
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
  async createOption(
    @UserId() userId: string,
    @Body() createOptionDto: CreateUserOptionDto,
  ) {
    const option = await this.userService.getOption(
      userId,
      createOptionDto.name,
    );
    if (option && option.name) {
      return await this.userService.updateOption(
        userId,
        option.name,
        createOptionDto.value,
      );
    }
    return await this.userService.createOption(userId, createOptionDto);
  }

  @Get('option/list')
  async listOption(@UserId() userId: string) {
    return await this.userService.listOption(userId);
  }

  @Get('option/:name')
  async getOption(@UserId() userId: string, @Param('name') name: string) {
    return await this.userService.getOption(userId, name);
  }

  @Get('binding/list')
  async listBinding(@UserId() userId: string) {
    return await this.userService.listBinding(userId);
  }
}
