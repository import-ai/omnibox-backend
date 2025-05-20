import { AuthService } from 'src/auth/auth.service';
import { LocalAuthGuard } from 'src/auth/local-auth.guard';
import { Public } from 'src/auth/decorators/public.decorator';
import {
  Body,
  Post,
  Request,
  UseGuards,
  Controller,
  HttpCode,
} from '@nestjs/common';
import { PermissionLevel } from 'src/permissions/permission-level.enum';
import { NamespaceRole } from 'src/namespaces/entities/namespace-member.entity';

@Controller('api/v1')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Public()
  @Post('login')
  @HttpCode(200)
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
    @Body('namespace') namespaceId: string,
    @Body('email') email: string,
    @Body('role') role: NamespaceRole,
    @Body('resourceId') resourceId: string,
    @Body('permissionLevel') permissionLevel: PermissionLevel,
    @Body('groupId') groupId: string,
  ) {
    const actions: Array<Promise<any>> = [];
    const userEmails = email.split(',');
    userEmails.forEach((userEmail) => {
      if (userEmail) {
        actions.push(
          this.authService.invite(req.user.id, userEmail, {
            role,
            inviteUrl,
            registerUrl,
            namespaceId,
            resourceId,
            permissionLevel,
            groupId,
          }),
        );
      }
    });
    return await Promise.all(actions);
  }

  @Post('invite/confirm')
  async inviteConfirm(@Body('token') token: string) {
    return await this.authService.inviteConfirm(token);
  }
}
