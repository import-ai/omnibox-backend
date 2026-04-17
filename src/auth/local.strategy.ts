import { Strategy } from 'passport-local';
import { AuthService } from 'omniboxd/auth/auth.service';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { Request } from 'express';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(
    private authService: AuthService,
    private i18n: I18nService,
  ) {
    super({
      usernameField: 'username',
      passwordField: 'password',
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    username: string,
    password: string,
  ): Promise<any> {
    const type = req.body.type as 'email' | 'phone' | undefined;
    const identifier = username;

    if (!identifier) {
      const message = this.i18n.t('auth.errors.invalidCredentials');
      throw new AppException(
        message,
        'INVALID_CREDENTIALS',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const user = await this.authService.verify(identifier, password, type);
    if (!user) {
      const message = this.i18n.t('auth.errors.invalidCredentials');
      throw new AppException(
        message,
        'INVALID_CREDENTIALS',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return user;
  }
}
