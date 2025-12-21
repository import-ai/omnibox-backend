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
  Post,
  Controller,
  ParseIntPipe,
  HttpStatus,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';

@Controller('api/v1/user')
export class UserController {
  constructor(
    private userService: UserService,
    private readonly i18n: I18nService,
  ) {}

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

  @Get('wx/profile')
  async wxProfile(@UserId() userId: string) {
    return await this.userService.find(userId);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return await this.userService.find(id);
  }

  @Post('email/validate')
  async validateEmail(@UserId() userId: string, @Body('email') email: string) {
    const result = await this.userService.validateEmail(userId, email);
    const message = this.i18n.t('user.success.emailVerificationSent');
    return {
      ...result,
      message,
    };
  }

  @Patch(':id')
  async update(
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() account: UpdateUserDto,
  ) {
    if (userId !== id) {
      const message = this.i18n.t('user.errors.cannotUpdateOtherUser');
      throw new AppException(
        message,
        'CANNOT_UPDATE_OTHER_USER',
        HttpStatus.FORBIDDEN,
      );
    }

    const result = await this.userService.update(id, account);
    // If email was updated, add success message
    if (account.email) {
      const message = this.i18n.t('user.success.emailUpdatedSuccessfully');
      return {
        ...result,
        message,
      };
    }
    return result;
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
