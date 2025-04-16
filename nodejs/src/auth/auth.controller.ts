import { AuthService } from 'src/auth/auth.service';
import { LocalAuthGuard } from 'src/auth/local-auth.guard';
import { Public } from 'src/auth/decorators/public.decorator';
import { Controller, Request, Body, Post, UseGuards } from '@nestjs/common';

@Controller('api/v1')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Public()
  @Post('login')
  async login(@Request() req) {
    return await this.authService.login(req.user.email);
  }

  @Public()
  @Post('forgot_password')
  async forgotPassword(
    @Body('url') url: string,
    @Body('email') email: string,
  ): Promise<void> {
    return this.authService.requestPasswordReset(url, email);
  }

  @Public()
  @Post('reset_password')
  async resetPassword(
    @Body('token') token: string,
    @Body('password') password: string,
  ): Promise<void> {
    return this.authService.resetPassword(token, password);
  }
}
