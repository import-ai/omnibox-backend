import { HttpStatus, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { I18nService } from 'nestjs-i18n';
import { AuthService } from 'omniboxd/auth/auth.service';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { Strategy } from 'passport-local';

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
