import { Response } from 'express';
import { AuthService } from 'omniboxd/auth/auth.service';
import { LocalAuthGuard } from 'omniboxd/auth/local-auth.guard';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
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
  HttpStatus,
} from '@nestjs/common';
import {
  SendEmailOtpDto,
  VerifyEmailOtpDto,
  SendEmailOtpResponseDto,
} from './dto/email-otp.dto';
import {
  SendPhoneOtpRequestDto,
  VerifyPhoneOtpRequestDto,
  SendPhoneOtpResponseDto,
} from './dto/phone-otp.dto';
import { InviteDto } from './dto/invite.dto';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { AppException } from 'omniboxd/common/exceptions/app.exception';

@Controller('api/v1')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
    private namespacesService: NamespacesService,
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
  @Post('auth/send-phone-otp')
  @HttpCode(200)
  async sendPhoneOtp(
    @Body() dto: SendPhoneOtpRequestDto,
  ): Promise<SendPhoneOtpResponseDto> {
    return await this.authService.sendPhoneOTP(dto.phone);
  }

  @Public()
  @Post('auth/send-signup-phone-otp')
  @HttpCode(200)
  async sendSignupPhoneOtp(
    @Body() dto: SendPhoneOtpRequestDto,
  ): Promise<SendPhoneOtpResponseDto> {
    return await this.authService.sendSignupPhoneOTP(dto.phone);
  }

  @Public()
  @Post('auth/verify-phone-otp')
  @HttpCode(200)
  async verifyPhoneOtp(
    @Body() dto: VerifyPhoneOtpRequestDto,
    @Res() res: Response,
    @Body('lang') lang?: string,
  ) {
    const authData = await this.authService.verifyPhoneOTP(
      dto.phone,
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

  @Post('invite')
  async invite(@Request() req, @Body() inviteDto: InviteDto) {
    const {
      inviteUrl,
      registerUrl,
      namespace: namespaceId,
      role,
      resourceId,
      permission,
      groupId,
      emails,
      groupTitles,
    } = inviteDto;

    // Check if current user is owner or admin of the namespace
    const isOwnerOrAdmin = await this.namespacesService.userIsOwnerOrAdmin(
      namespaceId,
      req.user.id,
    );
    if (!isOwnerOrAdmin) {
      throw new AppException(
        'Only owner or admin can invite users',
        'USER_NOT_OWNER_OR_ADMIN',
        HttpStatus.FORBIDDEN,
      );
    }

    if (groupTitles && groupTitles.length > 0 && resourceId && permission) {
      await this.authService.inviteGroup(
        namespaceId,
        resourceId,
        groupTitles,
        permission,
      );
    }
    if (emails && emails.length > 0) {
      await this.authService.inviteBatch(req.user.id, emails, {
        role,
        inviteUrl,
        registerUrl,
        namespaceId,
        resourceId,
        permission,
        groupId,
      });
    }
  }

  @Post('invite/confirm')
  async inviteConfirm(@UserId() userId: string, @Body('token') token: string) {
    return await this.authService.inviteConfirm(token, userId);
  }

  @Public()
  @Post('auth/accept-invite')
  @HttpCode(200)
  async acceptInvite(
    @Query('token') token: string,
    @Res() res: Response,
    @Body('lang') lang?: string,
  ) {
    const authData = await this.authService.acceptInvite(token, lang);

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

  @Post('logout')
  logout(@Res() res: Response) {
    res.clearCookie('token', {
      httpOnly: true,
      path: '/',
    });
    return res.json();
  }
}
