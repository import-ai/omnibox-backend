import { Response } from 'express';
import { AuthService } from 'omniboxd/auth/auth.service';
import { LocalAuthGuard } from 'omniboxd/auth/local-auth.guard';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { ConfigService } from '@nestjs/config';
import {
  Res,
  Body,
  Post,
  Request,
  UseGuards,
  Controller,
  HttpCode,
  Query,
} from '@nestjs/common';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { NamespaceRole } from 'omniboxd/namespaces/entities/namespace-member.entity';
import {
  SendEmailOtpDto,
  VerifyEmailOtpDto,
  SendEmailOtpResponseDto,
} from './dto/email-otp.dto';

@Controller('api/v1')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  @UseGuards(LocalAuthGuard)
  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Request() req, @Res() res: Response) {
    const loginData = this.authService.login(req.user);

    const jwtExpireSeconds = parseInt(
      this.configService.get('OBB_JWT_EXPIRE', '2678400'),
      10,
    );
    res.cookie('token', loginData.access_token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      maxAge: jwtExpireSeconds * 1000,
    });

    return res.json(loginData);
  }

  @Public()
  @Post('auth/send-otp')
  @HttpCode(200)
  async sendEmailOtp(
    @Body() dto: SendEmailOtpDto,
    @Body('url') url: string,
  ): Promise<SendEmailOtpResponseDto> {
    return await this.authService.sendOTP(dto.email, url);
  }

  @Public()
  @Post('auth/send-signup-otp')
  @HttpCode(200)
  async sendSignupOtp(
    @Body() dto: SendEmailOtpDto,
    @Body('url') url: string,
  ): Promise<SendEmailOtpResponseDto> {
    return await this.authService.sendSignupOTP(dto.email, url);
  }

  @Public()
  @Post('auth/verify-otp')
  @HttpCode(200)
  async verifyEmailOtp(
    @Body() dto: VerifyEmailOtpDto,
    @Res() res: Response,
    @Body('lang') lang?: string,
  ) {
    const authData = await this.authService.verifyOTP(
      dto.email,
      dto.code,
      lang,
    );

    const jwtExpireSeconds = parseInt(
      this.configService.get('OBB_JWT_EXPIRE', '2678400'),
      10,
    );
    res.cookie('token', authData.access_token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      maxAge: jwtExpireSeconds * 1000,
    });

    return res.json(authData);
  }

  @Public()
  @Post('auth/verify-magic')
  @HttpCode(200)
  async verifyMagicLink(
    @Query('token') token: string,
    @Res() res: Response,
    @Body('lang') lang?: string,
  ) {
    const authData = await this.authService.verifyMagicLink(token, lang);

    const jwtExpireSeconds = parseInt(
      this.configService.get('OBB_JWT_EXPIRE', '2678400'),
      10,
    );
    res.cookie('token', authData.access_token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      maxAge: jwtExpireSeconds * 1000,
    });

    return res.json(authData);
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
    @Res() res: Response,
  ) {
    const result = await this.authService.resetPassword(token, password);
    res.clearCookie('token', {
      httpOnly: true,
      path: '/',
    });
    return res.json(result);
  }

  @Post('invite')
  async invite(
    @Request() req,
    @Body('inviteUrl') inviteUrl: string,
    @Body('registerUrl') registerUrl: string,
    @Body('namespace') namespaceId: string,
    @Body('role') role: NamespaceRole,
    @Body('resourceId') resourceId: string,
    @Body('permission') permission: ResourcePermission,
    @Body('groupId') groupId: string,
    @Body('emails') emails: Array<string>,
    @Body('groupTitles') groupTitles: Array<string>,
  ) {
    if (groupTitles && groupTitles.length > 0) {
      await this.authService.inviteGroup(
        namespaceId,
        resourceId,
        groupTitles,
        permission,
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
            permission,
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

  @Post('logout')
  logout(@Res() res: Response) {
    res.clearCookie('token', {
      httpOnly: true,
      path: '/',
    });
    return res.json();
  }
}
