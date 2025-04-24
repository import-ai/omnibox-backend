import { AuthService } from 'src/auth/auth.service';
import { LocalAuthGuard } from 'src/auth/local-auth.guard';
import { Public } from 'src/auth/decorators/public.decorator';
import { Body, Post, Request, UseGuards, Controller } from '@nestjs/common';

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
  @Post('sign-up')
  async signUp(@Body('url') url: string, @Body('email') email: string) {
    return await this.authService.signUp(url, email);
  }

  @Public()
  @Post('sign-up/confirm')
  async signUpConfirm(
    @Body('token') token: string,
    @Body('username') username: string,
    @Body('password') password: string,
    @Body('password_repeat') password_repeat: string,
  ) {
    return await this.authService.signUpConfirm(token, {
      username,
      password,
      password_repeat,
    });
  }

  @Public()
  @Post('password')
  async password(@Body('url') url: string, @Body('email') email: string) {
    return await this.authService.password(url, email);
  }

  @Public()
  @Post('password/confirm')
  async resetPassword(
    @Body('token') token: string,
    @Body('password') password: string,
    @Body('password_repeat') password_repeat: string,
  ) {
    return this.authService.resetPassword(token, password, password_repeat);
  }

  @Post('invite')
  async invite(
    @Request() req,
    @Body('inviteUrl') inviteUrl: string,
    @Body('registerUrl') registerUrl: string,
    @Body('namespace') namespace: string,
    @Body('email') email: string,
    @Body('role') role: string,
  ) {
    return await this.authService.invite(req.user.id, email, {
      role,
      inviteUrl,
      registerUrl,
      namespace,
    });
  }

  @Post('invite/confirm')
  async inviteConfirm(@Body('token') token: string) {
    return await this.authService.inviteConfirm(token);
  }
}
