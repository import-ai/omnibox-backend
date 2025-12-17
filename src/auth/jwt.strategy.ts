import { Request } from 'express';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';

import { User } from 'omniboxd/user/entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
      throw new UnauthorizedException('Invalid token');
    }

    return {
      id: payload.sub,
      email: payload.email,
      username: payload.username,
    };
  }
}
