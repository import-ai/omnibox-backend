import { AuthService } from 'omniboxd/auth/auth.service';
import { LocalAuthGuard } from 'omniboxd/auth/local-auth.guard';
import { Public } from 'omniboxd/auth/decorators/public.decorator';
import {
  Body,
  Post,
  Request,
  UseGuards,
  Controller,
  HttpCode,
} from '@nestjs/common';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { NamespaceRole } from 'omniboxd/namespaces/entities/namespace-member.entity';

@Controller('api/v1')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Request() req) {
    return this.authService.login(req.user);
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
  ) {
    return await this.authService.signUpConfirm(token, {
      username,
      password,
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
  ) {
    return this.authService.resetPassword(token, password);
  }

  @Post('invite')
  async invite(
    @Request() req,
    @Body('inviteUrl') inviteUrl: string,
    @Body('registerUrl') registerUrl: string,
    @Body('namespace') namespaceId: string,
    @Body('role') role: NamespaceRole,
    @Body('resourceId') resourceId: string,
    @Body('permissionLevel') permissionLevel: ResourcePermission,
    @Body('groupId') groupId: string,
    @Body('emails') emails: Array<string>,
    @Body('groupTitles') groupTitles: Array<string>,
  ) {
    if (groupTitles && groupTitles.length > 0) {
      await this.authService.inviteGroup(
        namespaceId,
        resourceId,
        groupTitles,
        permissionLevel,
      );
    }
    if (emails && emails.length > 0) {
      await Promise.all(
        emails.map((email) =>
          this.authService.invite(req.user.id, email, {
            role,
            inviteUrl,
            registerUrl,
            namespaceId,
            resourceId,
            permissionLevel,
            groupId,
          }),
        ),
      );
    }
  }

  @Post('invite/confirm')
  async inviteConfirm(@Body('token') token: string) {
    return await this.authService.inviteConfirm(token);
  }
}
