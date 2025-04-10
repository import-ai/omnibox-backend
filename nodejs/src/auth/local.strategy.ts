import { Strategy } from 'passport-local';
import { AuthService } from 'src/auth/auth.service';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      usernameField: 'email',
      passwordField: 'password',
    });
  }

  async validate(email: string, password: string): Promise<any> {
    const user = await this.authService.verify(email, password);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
