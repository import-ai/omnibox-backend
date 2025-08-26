import { Request } from 'express';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      ignoreExpiration: false,
      secretOrKey: config.get('OBB_JWT_SECRET'),
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          // 优先从Cookie中提取
          if (request.cookies?.token) {
            return request.cookies.token as string;
          }
          // 其次从Authorization头部提取
          const authHeader = request.headers.authorization;
          if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.substring(7); // 移除 'Bearer ' 前缀
            return token.trim() || null;
          }
          return null;
        },
      ]),
    });
  }

  validate(payload: { sub: string; email?: string }) {
    return {
      id: payload.sub,
      email: payload.email,
    };
  }
}
