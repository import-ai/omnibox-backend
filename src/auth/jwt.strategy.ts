import { Request } from 'express';
import { Injectable, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { I18nService } from 'nestjs-i18n';

import { User } from 'omniboxd/user/entities/user.entity';
import { AppException } from 'omniboxd/common/exceptions/app.exception';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly i18n: I18nService,
  ) {
    super({
      ignoreExpiration: false,
      secretOrKey: config.get('OBB_JWT_SECRET'),
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          if (request.cookies?.token) {
            return request.cookies.token as string;
          }
          const authHeader = request.headers.authorization;
          if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            return token.trim() || null;
          }
          return null;
        },
      ]),
    });
  }

  async validate(payload: { sub: string; email?: string; username?: string }) {
    // Query user - TypeORM automatically excludes soft-deleted records
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    // Reject if user doesn't exist or is soft-deleted
    if (!user) {
      const message = this.i18n.t('auth.errors.invalidToken');
      throw new AppException(message, 'INVALID_TOKEN', HttpStatus.UNAUTHORIZED);
    }

    return {
      id: payload.sub,
      email: payload.email,
      username: payload.username,
    };
  }
}
