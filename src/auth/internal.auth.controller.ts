import { AuthService } from 'src/auth/auth.service';
import { Public } from 'src/auth/decorators/public.decorator';
import { Controller, Body, Post } from '@nestjs/common';
import { CreateUserDto } from 'src/user/dto/create-user.dto';

@Controller('internal/api/v1')
export class InternalAuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('sign-up')
  async signUp(@Body() createUserDto: CreateUserDto) {
    return await this.authService.signUpWithoutConfirm(createUserDto);
  }
}
