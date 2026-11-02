import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { I18nService } from 'nestjs-i18n';
import { AuthService } from 'omniboxd/auth/auth.service';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { LocalAuthGuard } from 'omniboxd/auth/local-auth.guard';
import { RequireCaptcha } from 'omniboxd/captcha/captcha.decorator';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { NamespaceRole } from 'omniboxd/namespaces/entities/namespace-member.entity';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { RateLimitByIp } from 'omniboxd/rate-limit/rate-limit.decorator';

import {
  SendEmailOtpDto,
  SendEmailOtpResponseDto,
  VerifyEmailOtpDto,
} from './dto/email-otp.dto';
import { InviteDto } from './dto/invite.dto';
import {
  SendPhoneOtpRequestDto,
  SendPhoneOtpResponseDto,
  VerifyPhoneOtpRequestDto,
} from './dto/phone-otp.dto';
import { getSessionCookieMaxAge, setSessionCookie } from './session-cookie';

@Controller('api/v1')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
    private namespacesService: NamespacesService,
    private readonly i18n: I18nService,
  ) {}

  @UseGuards(LocalAuthGuard)
  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Request() req, @Res() res: Response) {
    const loginData = this.authService.login(req.user);

    setSessionCookie(
      req,
      res,
      loginData.access_token,
      getSessionCookieMaxAge(this.configService),
    );

    return res.json(loginData);
  }

  /**
   * Validates the current session for the gateway's auth_request check.
   * Only verifies the JWT signature and expiry; it deliberately skips the user
   * lookup so root path navigations do not hit the database.
   */
  @Public()
  @Get('auth/session')
  @HttpCode(HttpStatus.NO_CONTENT)
  authSession(@Request() req) {
    const cookieToken = req.cookies?.token as string | undefined;
    const authorization = req.headers.authorization;
    const bearerToken = authorization?.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : undefined;
    const payload = this.authService.jwtVerify(
      cookieToken || bearerToken || '',
    );

    if (!payload?.sub) {
      throw new AppException(
        this.i18n.t('auth.errors.invalidTokenPayload'),
        'INVALID_TOKEN_PAYLOAD',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  /**
   * Establishes the session cookie for clients that receive a token outside a
   * cookie, such as the mini program hash hand-off. The gateway only sees
   * cookies, so a full-page navigation would otherwise look signed out.
   */
  @Public()
  @Post('auth/session')
  createSession(@Request() req, @Res() res: Response) {
    const cookieToken = req.cookies?.token as string | undefined;
    const authorization = req.headers.authorization;
    const bearerToken = authorization?.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : '';
    const token = bearerToken || cookieToken || '';
    const payload = this.authService.jwtVerify(token);

    if (!payload?.sub) {
      throw new AppException(
        this.i18n.t('auth.errors.invalidTokenPayload'),
        'INVALID_TOKEN_PAYLOAD',
        HttpStatus.UNAUTHORIZED,
      );
    }

    setSessionCookie(
      req,
      res,
      token,
      getSessionCookieMaxAge(this.configService),
    );
    return res.json({ uid: payload.sub });
  }

  @Public()
  @RequireCaptcha()
  @RateLimitByIp()
  @Post('auth/send-otp')
  @HttpCode(200)
  async sendEmailOtp(
    @Body() dto: SendEmailOtpDto,
    @Body('url') url: string,
  ): Promise<SendEmailOtpResponseDto> {
    return await this.authService.sendOTP(dto.email, url);
  }

  @Public()
  @RequireCaptcha()
  @RateLimitByIp()
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
    @Request() req,
    @Res() res: Response,
    @Body('lang') lang?: string,
  ) {
    const authData = await this.authService.verifyOTP(
      dto.email,
      dto.code,
      lang,
    );

    setSessionCookie(
      req,
      res,
      authData.access_token,
      getSessionCookieMaxAge(this.configService),
    );

    return res.json(authData);
  }

  @Public()
  @Post('auth/verify-magic')
  @HttpCode(200)
  async verifyMagicLink(
    @Query('token') token: string,
    @Request() req,
    @Res() res: Response,
    @Body('lang') lang?: string,
  ) {
    const authData = await this.authService.verifyMagicLink(token, lang);

    setSessionCookie(
      req,
      res,
      authData.access_token,
      getSessionCookieMaxAge(this.configService),
    );

    return res.json(authData);
  }

  @Public()
  @RequireCaptcha()
  @RateLimitByIp()
  @Post('auth/send-phone-otp')
  @HttpCode(200)
  async sendPhoneOtp(
    @Body() dto: SendPhoneOtpRequestDto,
  ): Promise<SendPhoneOtpResponseDto> {
    return await this.authService.sendPhoneOTP(dto.phone);
  }

  @Public()
  @RequireCaptcha()
  @RateLimitByIp()
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
    @Request() req,
    @Res() res: Response,
    @Body('lang') lang?: string,
  ) {
    const authData = await this.authService.verifyPhoneOTP(
      dto.phone,
      dto.code,
      lang,
    );

    setSessionCookie(
      req,
      res,
      authData.access_token,
      getSessionCookieMaxAge(this.configService),
    );

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
      inviteType,
    } = inviteDto;

    const member = await this.namespacesService.getMemberByUserId(
      namespaceId,
      req.user.id,
    );
    if (
      member?.role !== NamespaceRole.OWNER &&
      member?.role !== NamespaceRole.ADMIN
    ) {
      throw new AppException(
        'Only owner or admin can invite users',
        'USER_NOT_OWNER_OR_ADMIN',
        HttpStatus.FORBIDDEN,
      );
    }

    if (
      emails?.length &&
      role !== NamespaceRole.MEMBER &&
      !(member.role === NamespaceRole.OWNER && role === NamespaceRole.ADMIN)
    ) {
      throw new AppException(
        this.i18n.t('namespace.errors.cannotAssignHigherRole'),
        'CANNOT_ASSIGN_HIGHER_ROLE',
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
        inviteType,
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
    @Request() req,
    @Res() res: Response,
    @Body('lang') lang?: string,
  ) {
    const authData = await this.authService.acceptInvite(token, lang);

    setSessionCookie(
      req,
      res,
      authData.access_token,
      getSessionCookieMaxAge(this.configService),
    );

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
