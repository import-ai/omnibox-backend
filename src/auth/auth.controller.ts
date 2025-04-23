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
  @Post('register')
  async register(@Body('url') url: string, @Body('email') email: string) {
    return await this.authService.register(url, email);
  }

  @Public()
  @Post('register-confirm')
  async registerComFirm(
    @Body('token') token: string,
    @Body('username') username: string,
    @Body('password') password: string,
    @Body('password_repeat') password_repeat: string,
  ) {
    return await this.authService.registerComfirm(token, {
      username,
      password,
      password_repeat,
    });
  }

  @Public()
  @Post('forgot-password')
  async forgotPassword(
    @Body('url') url: string,
    @Body('email') email: string,
  ): Promise<void> {
    return await this.authService.requestPasswordReset(url, email);
  }

  @Public()
  @Post('reset-password')
  async resetPassword(
    @Body('token') token: string,
    @Body('password') password: string,
    @Body('password_repeat') password_repeat: string,
  ): Promise<void> {
    return await this.authService.resetPassword(
      token,
      password,
      password_repeat,
    );
  }
}
