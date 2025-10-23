import { Controller } from '@nestjs/common';
import { AuthService } from 'omniboxd/auth/auth.service';

@Controller()
export class SocialController {
  constructor(protected readonly authService: AuthService) {}

  protected async findUserId(authorization: string | undefined) {
    let userId: string = '';

    if (authorization) {
      const headerToken = authorization.replace('Bearer ', '');
      if (headerToken) {
        const payload = await this.authService.jwtVerify(headerToken);
        if (payload && payload.sub) {
          userId = payload.sub;
        }
      }
    }

    return userId;
  }
}
