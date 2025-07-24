import { AuthService } from 'omnibox-backend/auth/auth.service';
import { Public } from 'omnibox-backend/auth/decorators/public.decorator';
import { Controller, Body, Post } from '@nestjs/common';
import { CreateUserDto } from 'omnibox-backend/user/dto/create-user.dto';

@Controller('internal/api/v1')
export class InternalAuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('sign-up')
  async signUp(@Body() createUserDto: CreateUserDto) {
    return await this.authService.signUpWithoutConfirm(createUserDto);
  }
}
