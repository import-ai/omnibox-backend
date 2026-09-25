import { Body, Controller, Header, Headers, Post, Req } from '@nestjs/common';
import { Expose } from 'class-transformer';
import { Matches } from 'class-validator';
import { Request } from 'express';
import { i18nValidationMessage } from 'nestjs-i18n';

import { Public } from '../decorators/public.auth.decorator';
import { DesktopAuthService } from './desktop-auth.service';

const message = { message: i18nValidationMessage('auth.desktop.invalid') };
class StartDesktopRequestDto {
  @Expose({ name: 'code_challenge' })
  @Matches(/^[A-Za-z0-9_-]{43}$/, message)
  codeChallenge: string;

  @Matches(/^[A-Za-z0-9_-]{43,128}$/, message)
  state: string;

  @Expose({ name: 'client_id' })
  @Matches(/^omnibox-auth-(test|pre|prod)$/, message)
  clientId: string;
}
class AuthorizeDesktopRequestDto {
  @Matches(/^[a-f0-9]{64}$/, message)
  transaction: string;
}
class ConfirmDesktopRequestDto extends AuthorizeDesktopRequestDto {
  @Expose({ name: 'user_id' })
  @Matches(/^[a-zA-Z0-9-]{1,64}$/, message)
  userId: string;
}
class ExchangeDesktopRequestDto extends AuthorizeDesktopRequestDto {
  @Matches(/^[a-f0-9]{64}$/, message)
  code: string;

  @Expose({ name: 'code_verifier' })
  @Matches(/^[A-Za-z0-9._~-]{43,128}$/, message)
  codeVerifier: string;
}

@Controller('api/v1/desktop-auth')
export class DesktopAuthController {
  constructor(private readonly auth: DesktopAuthService) {}

  @Public()
  @Post('start')
  @Header('Cache-Control', 'no-store')
  start(@Body() dto: StartDesktopRequestDto, @Req() req: Request) {
    return this.auth.start(
      dto.codeChallenge,
      dto.state,
      dto.clientId,
      req.ip || 'unknown',
    );
  }

  @Public()
  @Post('authorize')
  @Header('Cache-Control', 'no-store')
  authorize(
    @Body() dto: ConfirmDesktopRequestDto,
    @Headers('authorization') authorization: string,
  ) {
    return this.auth.authorize(dto.transaction, authorization, dto.userId);
  }

  @Public()
  @Post('exchange')
  @Header('Cache-Control', 'no-store')
  exchange(@Body() dto: ExchangeDesktopRequestDto, @Req() req: Request) {
    return this.auth.exchange(
      dto.transaction,
      dto.code,
      dto.codeVerifier,
      req.ip || 'unknown',
    );
  }
}
